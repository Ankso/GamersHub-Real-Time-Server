var config = require("./Config.js").Initialize();

var User = function() {
    this.id = null;
    this.username = null;
    this.sessionId = null;
    this.phpsessid = null;
    this.passwordSha1 = null;
    this.socket = null;
    this.timeout = null;
    this.avatarPath = null;
    this.isAfk = false;
}

User.prototype.UpdateTimeout = function(sessionsConnection, usersConnection, usersArray, forcedTimeout) {
    var self = this;
    var id = self.id;
    
    if (!forcedTimeout)
        var forcedTimeout = config.USER.MAX_TIME_BETWEEN_PINGS;
    
    console.log("Updating inactivity timeout for user " + id + " (" + forcedTimeout / 1000 + " seconds left)");
    if (self.timeout)
        clearTimeout(self.timeout);
    self.timeout = setTimeout(function() {
        usersArray[id].LogOff(sessionsConnection, usersConnection, usersArray);
    }, forcedTimeout);
};
User.prototype.LogOff = function(sessionsConnection, usersConnection, usersArray, response, responseCallback) {
    var self = this;
    
    clearTimeout(self.timeout);
    sessionsConnection.query("DELETE FROM sessions WHERE id = ?", [self.phpsessid], function(err) {
        if (err)
            console.log("MySQL sessions error: " + err.message);
    });
    usersConnection.query("UPDATE user_data SET random_session_id = NULL, is_online = 0 WHERE id = ?", [self.id], function(err) {
        if (err)
            console.log("MySQL users error: " + err.message);
    });
    usersConnection.query("SELECT a.id FROM user_data AS a, user_friends AS b WHERE b.user_id = ? AND b.friend_id = a.id AND a.is_online = 1",
                          [self.id], function(err, results, fields) {
        if (err)
            console.log("MySQL users error: " + err.message);
        
        if (!response)
        {
            for (var i in results)
            {
                if (usersArray[results[i].id])
                    usersArray[results[i].id].SendFriendLogOff(self.id, self.username, self.avatarPath);
            }
        }
    });
    // The socket _must_ exists here, check just in case.
    if (self.socket)
    {
        self.socket.emit("disconnection", { type: "FORCED" });
        self.socket.disconnect();
    }
    else
        console.log("Weird error: socket object doesn't exists for user " + self.id);
    usersArray.splice(self.id, 1);
    if (response)
    {
        response.writeHead(200, { "Content-Type" : "application/json" });
        response.end(responseCallback + "(" + JSON.stringify({ status : "ALREADY_LOGGED_IN" }) + ")");
    }
    console.log("User " + self.id + " has logged off successfully");
};
User.prototype.SetAfk = function(sessionsConnection, usersConnection) {
    var self = this;
    
    sessionsConnection.query("DELETE FROM sessions WHERE id = ?", [self.phpsessid], function(err) {
        if (err)
            console.log("MySQL error: " + err.message);
    });
    usersConnection.query("UPDATE user_data SET random_session_id = NULL WHERE id = ?", [self.id], function(err) {
        if (err)
            console.log("MySQL error: " + err.message);
    });
    self.isAfk = true;
    console.log("User " + self.id + " is now AFK.");
};
User.prototype.UnsetAfk = function(sessionsConnection, usersConnection) {
    var self = this;
    var userIdData = "userId|i:" + self.id + ";";
    
    sessionsConnection.query("INSERT INTO sessions VALUES (?, ?, ?)", [self.phpsessid, userIdData, Math.round(new Date().getTime() / 1000)], function(err) {
        if (err)
            console.log("MySQL error: " + err.message);
    });
    usersConnection.query("UPDATE user_data SET random_session_id = ? WHERE id = ?", [self.sessionId, self.id], function(err) {
        if (err)
            console.log("MySQL error: " + err.message);
    });
    self.isAfk = false;
    self.socket.emit("afkModeDisabled", { success: true });
    console.log("User " + self.id + " is no longer AFK");
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
User.prototype.SendChatMessage = function(user, message) {
    var self = this;
    
    if (self.socket)
        self.socket.emit("parseChatMessage", { friendId : user.id, friendName : user.username, message : message });
};
User.prototype.SendChatInvitation = function(user) {
    var self = this;
    
    if (self.socket)
        self.socket.emit("enterChat", { friendId : user.id, friendName : user.username });
};

function Initialize()
{
    return new User();
}

exports.Initialize = Initialize;