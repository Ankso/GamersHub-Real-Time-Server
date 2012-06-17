var server = require("http").createServer(handler);
var url = require("url");
var io = require("socket.io").listen(server);
var querystring = require("querystring");
var mysql = require("mysql");
var usersConnection = mysql.createConnection({
    host : "localhost",
    user : "root",
    password : "password",
});
var sessionsConnection = mysql.createConnection({
    host : "localhost",
    user : "root",
    password : "password",
});
var User = function() {
    this.id = null;
    this.username = null;
    this.sessionId = null;
    this.phpsessid = null;
    this.socket = null;
    this.timeout = null;
    this.avatarPath = null;
}

User.prototype.UpdateTimeout = function() {
    var self = this;
    
    console.log("Updating inactivity timeout for user " + self.id + " (5 minutes left)");
    if (self.timeOut)
        clearTimeout(self.timeOut);
    self.timeOut = setTimeout(function() { self.LogOff(); }, 300000);
};
User.prototype.LogOff = function() {
    var self = this;
    
    sessionsConnection.query("DELETE FROM sessions WHERE id = ?", self.phpsessid, function(err) {
        if (err)
            console.log("MySQL error: " + err.description);
        usersConnection.query("UPDATE user_data SET random_session_id = NULL, is_online = 0 WHERE id = ?", self.id, function(err) {
            if (self.socket)
            {
                self.socket.emit("disconnection", { type: "FORCED" });
                self.socket.disconnect();
            }
            clearTimeout(self.timeout);
            usersConnection.query("SELECT a.id FROM user_data AS a, user_friends AS b WHERE b.user_id = ? AND b.friend_id = a.id AND a.is_online = 1", self.id, function(err, results, fields) {
                if (err)
                    console.log("MySQL error: " + err.description);

                for (var i in results)
                {
                    if (users[results[i].id])
                        users[results[i].id].SendFriendLogOff(self.id, self.username, self.avatarPath);
                }
                users.splice(self.id, 1);
                console.log("User " + self.id + " has logged off successfully");
            });
        });
    });
};
User.prototype.SendFriendLogIn = function(friendId, friendName, friendAvatarPath) {
    var self = this;
    
    if (self.socket)
        self.socket.emit("friendLogin", { friendId : friendId, friendName : friendName, friendAvatarPath : friendAvatarPath });
};
User.prototype.SendFriendLogOff = function(friendId, friendName, friendAvatarPath) {
    var self = this;
    
    if (self.socket)
        self.socket.emit("friendLogoff", { friendId : friendId, friendName : friendName, friendAvatarPath : friendAvatarPath });
};
User.prototype.SendChatMessage = function(userId, message) {
    var self = this;
    
    if (self.socket)
        self.socket.emit("parseChatMessage", { friendName : users[userId].username, message : message });
};
User.prototype.SendChatInvitation = function(userId) {
    var self = this;
    
    if (self.socket)
        self.socket.emit("enterChat", { friendId : userId, friendName : users[userId].username });
};
var users = new Array();

console.log("Welcome to GamersHub's Real Time Web App Server.");
console.log("Starting server on port 5124...");
server.listen(5124);
console.log("Server started successfully.");
console.log("Connecting to MySQL databases...");
usersConnection.connect();
usersConnection.query("USE users");
console.log("Connection to user's database established successfully.");
sessionsConnection.connect();
sessionsConnection.query("USE sessions");
console.log("Connection to sessions's database established successfully.");
console.log("Loading currently online users from the database...");

// Load all online users from DB
usersConnection.query("SELECT a.id, a.username, a.random_session_id, b.avatar_path FROM user_data AS a, user_avatars AS b WHERE is_online = 1 AND a.id = b.user_id", function(err, results, fields) {
    for (var i in results)
    {
        var user = new User();
        user.id = results[i].id;
        user.username = results[i].username;
        user.sessionId = results[i].random_session_id;
        user.avatarPath = results[i].avatar_path;
        user.UpdateTimeout();
        users[user.id] = user;
        console.log("User " + results[i].id + " has been reloaded from the database, is now logged in.");
    }
    sessionsConnection.query("SELECT id, data FROM sessions", function(err, results, fields) {
        for (var i in results)
        {
            var userId = results[i].data;
            userId = userId.substring(9, (userId.length - 1));
            console.log("Binding PHPSESSID " + results[i].id + " to User " + userId);
            if (users[userId])
                users[userId].phpsessid = results[i].id;
            else
            {
                console.log("User " + userId + " has a binded PHPSESSID, but is not logged in. Removing from database.");
                sessionsConnection.query("DELETE FROM sessions WHERE id = ?", results[i].id, function(err) {
                    if (err)
                        console.log("MySQL error: " + err.description);
                });
            }
        }
    });
});

console.log("Server is now listening for upcoming connections.");

function handler (request, response) {
    var urlParts = url.parse(request.url, true);
    var pathName = urlParts.pathname;
    var sessionId = "";

    if (pathName == "/login")
    {
        console.log("Login request received");
        var callback = urlParts.query.callback;
        var user = new User();
        user.id = urlParts.query.userId;
        user.sessionId = urlParts.query.sessionId;
        
        if (!user.id || !user.sessionId)
        {
            console.log("Login request is malformed!");
            response.writeHead(200, { "Content-Type" : "application/json" });
            response.end(callback + "(" + JSON.stringify({ status : "FAILED" }) + ")");
            return;
        }
        
        console.log("User " + user.id + " is trying to log in with RNDSESSID " + user.sessionId);
        usersConnection.query("SELECT a.username, b.avatar_path FROM user_data AS a, user_avatars AS b WHERE id = ? AND random_session_id = ? AND a.id = b.user_id", [user.id, user.sessionId], function(err, results, fields) {
            if (err)
            {
                console.log("MySQL error: " + err.message);
                return;
            }
            
            response.writeHead(200, { "Content-Type" : "application/json" });
            if (results.length > 0)
            {
                user.username = results[0].username;
                user.avatarPath = results[0].avatar_path;
                sessionsConnection.query("SELECT id FROM sessions WHERE data = 'userId|i:" + user.id + ";'", function(err, results, fields) {
                    if (err)
                    {
                        console.log("MySQL error: " + err.message);
                        return;
                    }
                    
                    if (results.length > 0)
                    {
                        user.phpsessid = results[0].id;
                        user.UpdateTimeout();
                        users[user.id] = user;
                        response.end(callback + "(" + JSON.stringify({ status : "SUCCESS" }) + ")");
                        console.log("User " + user.id + " successfully logged in.");
                    }
                    else
                    {
                        response.end(callback + "(" + JSON.stringify({ status : "FAILED" }) + ")");
                        console.log("User " + user.id + " has sent bad login information.");
                    }
                });
            }
            else
            {
                response.end(callback + "(" + JSON.stringify({ status : "FAILED" }) + ")");
                console.log("User " + user.id + " has sent bad login information.");
            }
        });
    }
    else if (pathName == "/stats")
    {
        console.log(pathName + " petition received");
        response.writeHead(200, {"Content-Type" : "text/plain"});
        if (users.length == 0)
            response.write("No logged in users");
        else
        {
            response.write("Users logged in:\n");
            for (var i in users)
            {
                response.write("User: " + users[i].id + ":\n");
                response.write("    Session: " + users[i].sessionId + "\n");
                response.write("    Username: " + users[i].username + "\n");
                response.write("    PHPSESSID: " + users[i].phpsessid + "\n");
                response.write("    AvatarPath: " + users[i].avatarPath + "\n");
            }
        }
        response.end();
    }
    else
    {
        console.log("Request for undefined path " + pathName + " received.");
        response.writeHead(404, {"Content-Type" : "text/plain"});
        response.end();
    }
}

io.sockets.on("connection", function (socket) {
    socket.emit("requestCredentials", { status: "SUCCESS" });
    socket.on("sendCredentials", function (data) {
        console.log("User " + data.userId + " is trying to open a new socket, RNDSESSID: " + data.sessionId);
        if (users[data.userId])
        {
            if (users[data.userId].sessionId == data.sessionId)
            {
                // Add all necessary handlers to the socket
                console.log("User " + data.userId + " data OK, connection established");
                socket.on("logoff", function() {
                    // This should never happen
                    if (!users[data.userId])
                    {
                        console.log("Trying to logoff the disconnected user " + data.userId + " detected!");
                        return;
                    }
                    users[data.userId].LogOff();
                });
                socket.on("chatInvitation", function(data) {
                    if (users[data.friendId])
                        users[data.friendId].SendChatInvitation(data.userId);
                });
                socket.on("chatMessage", function(data) {
                    console.log("Sending new chat message of " + data.userId + " to " + data.friendId);
                    if (users[data.friendId])
                        users[data.friendId].SendChatMessage(data.userId, data.message);
                });
                socket.on("ping", function(data) {
                    if (users[data.userId])
                        users[data.userId].UpdateTimeout();
                });
                if (users[data.userId].socket)
                {
                    // If the user has an opened socket stored, just replace the old by the new one.
                    socket.emit("logged", { status: "SUCCESS" });
                    users[data.userId].socket = socket;
                    users[data.userId].UpdateTimeout();
                    console.log("User " + data.userId + " has reconnected successfully");
                    return;
                }
                users[data.userId].socket = socket;
                socket.emit("logged", { status: "SUCCESS" });
                // Send that a friend has logged in to the friends
                usersConnection.query("SELECT a.id FROM user_data AS a, user_friends AS b WHERE b.user_id = ? AND b.friend_id = a.id AND a.is_online = 1", data.userId, function(err, results, fields) {
                    if (err)
                    {
                        console.log("MySQL error: " + err.description);
                        return;
                    }
                    // Is this blocking code?
                    for (var i in results)
                    {
                        if (users[results[i].id])
                            users[results[i].id].SendFriendLogIn(users[data.userId].id, users[data.userId].username, users[data.userId].avatarPath);
                    }
                });
            }
            else
            {
                console.log("User " + data.userId + " data incorrect, connection closed");
                socket.emit("logged", { status: "INCORRECT" });
                socket.emit("disconnection", { type: "FORCED" });
                socket.disconnect();
            }
        }
        else
        {
            console.log("User " + data.userId + " is not registered, connection closed");
            socket.emit("logged", { status: "FAILED" });
            socket.emit("disconnection", { type: "FORCED" });
            socket.disconnect();
        }
    });
});

usersConnection.on('close', function(err) {
    if (err)
    {
      // We did not expect this connection to terminate
      console.log("Connection to user's DB lost, reconnecting...");
      usersConnection = mysql.createConnection(usersConnection.config);
    }
    else
    {
        console.log("Connection to user's DB closed.");
    }
});

sessionsConnection.on('close', function(err) {
    if (err)
    {
        // We did not expect this connection to terminate
        console.log("Connection to session's DB lost, reconnecting...");
        sessionsConnection = mysql.createConnection(sessionsConnection.config);
    }
    else
    {
        console.log("Connection to session's DB closed.");
    }
});