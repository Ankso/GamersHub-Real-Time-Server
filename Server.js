console.log("");
console.log("Welcome to...");
console.log("");
console.log("GGGGGG AAAAAA M    M EEEEEE RRRRR  | SSSSSS HH  HH UU  UU BBBBB   TM");
console.log("G      A    A MM  MM EE     RR  RR   SS     HH  HH UU  UU BB  BB");
console.log("G   GG AAAAAA M MM M EEEEE  RRRRR    SSSSSS HHHHHH UU  UU BBBBB");
console.log("G    G A    A M    M EE     RR RR        SS HH  HH UU  UU BB  BB");
console.log("GGGGGG A    A M    M EEEEEE RR  RR   SSSSSS HH  HH UUUUUU BBBBB");
console.log("--------------------------------------------------------------------");
console.log("RRRRRRRRR    TTTTTTTTTTTTT   SSSSSSSSSS ");
console.log("RRR     RR   TTTTTTTTTTTTT  SSSSSSSSSS ");
console.log("RRR      RR       TTT      SSS          ");
console.log("RRR     RR        TTT       SSSSSSSSS  ");
console.log("RRRRRRRRR         TTT        SSSSSSSSS ");
console.log("RRR   RRR         TTT               SSS ");
console.log("RRR    RRR        TTT       SSSSSSSSSS ");
console.log("RRR     RRR EAL   TTT IME  SSSSSSSSSS ERVER");
console.log("");

var config = require("./Config.js").Initialize();
var opcodeHandler = require("./OpcodeHandler.js").Initialize();
var server = require("http").createServer(handler);
var url = require("url");
var io = require("socket.io").listen(server);
var querystring = require("querystring");
var mysql = require("mysql");
var usersConnection = mysql.createConnection(config.MYSQL);
var sessionsConnection = mysql.createConnection(config.MYSQL);
var users = new Array();


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
usersConnection.query("SELECT a.id, a.username, a.password_sha1, a.random_session_id, b.avatar_path FROM user_data AS a, user_detailed_data AS b WHERE is_online = 1 AND a.id = b.user_id", function(err, results, fields) {
    if (err)
        console.log("MySQL error: " + err.message);
    
    for (var i in results)
    {
        var user = require("./User.js").Initialize();
        user.id = results[i].id;
        user.username = results[i].username;
        user.sessionId = results[i].random_session_id;
        user.passwordSha1 = results[i].password_sha1;
        user.avatarPath = results[i].avatar_path;
        user.UpdateTimeout(sessionsConnection, usersConnection, users);
        users[user.id] = user;
        console.log("User " + results[i].id + " has been reloaded from the database, is now logged in.");
    }
    sessionsConnection.query("SELECT id, data FROM sessions", function(err, results, fields) {
        if (err)
            console.log("MySQL error: " + err.message);
        
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
                        console.log("MySQL error: " + err.message);
                });
            }
        }
        InitializeSocketIO();
    });
});

function handler (request, response) {
    var urlParts = url.parse(request.url, true);
    var pathName = urlParts.pathname;
    var sessionId = "";

    if (pathName == "/login")
    {
        console.log("Login request received");
        var callback = urlParts.query.callback;
        var user = require("./User.js").Initialize();
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
        
        if (users[user.id])
        {
            console.log("User " + user.id + " is trying to log in from a different location, logging him off...");
            // We should log the user off, send to the client that the user has been disconnected.
            users[user.id].LogOff(sessionsConnection, usersConnection, users, response, callback);
            // The response is writed and returned in the User.LogOff to make sure that the user is
            // really logged off.
        }
        usersConnection.query("SELECT a.username, a.password_sha1, b.avatar_path FROM user_data AS a, user_detailed_data AS b WHERE id = ? AND random_session_id = ? AND a.id = b.user_id", [user.id, user.sessionId], function(err, results, fields) {
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
                user.passwordSha1 = results[0].password_sha1;
                sessionsConnection.query("SELECT id FROM sessions WHERE data = 'userId|i:" + user.id + ";'", function(err, results, fields) {
                    if (err)
                    {
                        console.log("MySQL error: " + err.message);
                        return;
                    }
                    
                    if (results.length > 0)
                    {
                        user.phpsessid = results[0].id;
                        user.UpdateTimeout(sessionsConnection, usersConnection, users);
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
            response.write("(" + users.length + ") Users logged in:\n");
            for (var i in users)
            {
                response.write("User: " + users[i].id + ":\n");
                response.write("    Session: " + users[i].sessionId + "\n");
                response.write("    Username: " + users[i].username + "\n");
                response.write("    PHPSESSID: " + users[i].phpsessid + "\n");
                response.write("    PasswordSha1: " + users[i].passwordSha1 + "\n");
                response.write("    AvatarPath: " + users[i].avatarPath + "\n");
                response.write("Debug: " + users[i] + "\n");
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

function InitializeSocketIO()
{
    // We can't disable heartbets because it seems that socket.io is bugged :S
    // io.disable("heartbeats");
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
                    socket.on("packet", function(data) {
                        opcodeHandler.ProcessPacket(data, users, sessionsConnection, usersConnection);
                    });
                    if (users[data.userId].socket)
                    {
                        // If the user has an opened socket stored, just replace the old by the new one.
                        socket.emit("logged", { status: "SUCCESS" });
                        users[data.userId].socket = socket;
                        users[data.userId].UpdateTimeout(sessionsConnection, usersConnection, users);
                        // We can send now the latest news stored in the RTS, they will be added to the news stored in the DB.
                        if (users[data.userId].lastNews.length)
                        {
                            console.log("Sending the latest news to user: " + data.userId);
                            for (var i in users[data.userId].lastNews)
                            {
                                if (!users[data.userId].lastNews[i])
                                    continue;
                                
                                if (users[data.userId].socket)
                                {
                                    users[data.userId].socket.emit("realTimeNew", {
                                        friendId: users[data.userId].lastNews[i].friendId,
                                        newType: users[data.userId].lastNews[i].newType,
                                        extraInfo: users[data.userId].lastNews[i].extraInfo,
                                    });
                                }
                            }
                        }
                        console.log("User " + data.userId + " has reconnected successfully");
                        return;
                    }
                    users[data.userId].socket = socket;
                    socket.emit("logged", { status: "SUCCESS" });
                    // Send that a friend has logged in to the user's friends
                    usersConnection.query("SELECT a.id FROM user_data AS a, user_friends AS b WHERE b.user_id = ? AND b.friend_id = a.id AND a.is_online = 1", [data.userId], function(err, results, fields) {
                        if (err)
                        {
                            console.log("MySQL error: " + err.message);
                            return;
                        }
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
    console.log("Server is now listening for upcoming connections");
}

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