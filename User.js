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
    this.isPlaying = false;
    this.gameInfo = {
        id: null,
        title: null,
        imagePath: null,
    };
    this.lastNews = new Array();
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
    var jsonLatestNews = "";
    
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
    self.UpdateLatestNews(usersConnection);
    /*
     * The socket _must_ exists here, unless:
     * 1) The client is in the log in process or
     * 2) The data has been reloaded after a server shutdown/crash.
     * Check just in case.
     */
    if (self.socket)
    {
        self.socket.emit("disconnection", { type: "FORCED" });
        self.socket.disconnect();
    }
    else
        console.log("Error: socket object doesn't exists for user " + self.id);
    delete usersArray[self.id];
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
    if (self.socket)
        self.socket.emit("afkModeDisabled", { success: true });
    console.log("User " + self.id + " is no longer AFK");
};
User.prototype.SendFriendLogIn = function(friendId, friendName, friendAvatarPath) {
    if (this.socket)
        this.socket.emit("friendLogin", { friendId : friendId, friendName : friendName, friendAvatarPath : friendAvatarPath });
};
User.prototype.SendFriendLogOff = function(friendId, friendName, friendAvatarPath) {
    if (this.socket)
        this.socket.emit("friendLogoff", { friendId : friendId, friendName : friendName, friendAvatarPath : friendAvatarPath });
};
User.prototype.SendChatMessage = function(user, message) {
    if (this.socket)
        this.socket.emit("parseChatMessage", { friendId : user.id, friendName : user.username, message : message });
};
User.prototype.SendChatInvitation = function(user) {
    if (this.socket)
        this.socket.emit("enterChat", { friendId : user.id, friendName : user.username });
};
User.prototype.SendFriendStartsPlaying = function(friendId, gameId, gameTitle, gameImagePath) {
    if (this.socket)
        this.socket.emit("friendStartsPlaying", { friendId: friendId, gameId: gameId, gameTitle: gameTitle, gameImagePath: gameImagePath });
};
User.prototype.SendFriendStopsPlaying = function(friendId) {
    if (this.socket)
        this.socket.emit("friendStopsPlaying", { friendId: friendId });
};
User.prototype.SetPlaying = function(isPlaying, gameId, gameTitle, gameImagePath) {
    if (isPlaying)
    {
        this.isPlaying = true;
        this.gameInfo.id = gameId;
        this.gameInfo.title = gameTitle;
        this.gameInfo.imagePath = gameImagePath;
    }
    else
    {
        this.isPlaying = false;
        this.gameInfo.id = null;
        this.gameInfo.title = null;
        this.gameInfo.imagePath = null;
    }
};
User.prototype.AddLatestNew = function(friendId, newType, extraInfo) {
    var nextIndex = 0;
    
    if (this.lastNews.length)
        nextIndex = this.lastNews.length + 1;
    
    this.lastNews[nextIndex] = {
        friendId: friendId,
        newType: newType,
        extraInfo: extraInfo,
    };
};
User.prototype.UpdateLatestNews = function(usersConnection) {
    var self = this;
    
    if (self.lastNews.length)
    {
        console.log("Saving latest news of the user " + self.id + " in the database.");
        var totalSavedNews = 0;
        var jsonLatestNews = "";
        for (var i in self.lastNews)
        {
            if (totalSavedNews > 10)
                break;
                
            if (!self.lastNews[i])
                continue;
            
            jsonLatestNews = JSON.stringify(self.lastNews[i]) + ";#;" + jsonLatestNews;
            ++totalSavedNews;
        }
        usersConnection.query("REPLACE INTO user_latest_news (user_id, latest_news_json) VALUES (" + self.id + ", '" + jsonLatestNews + "')", function(err) {
            if (err)
                console.log("MySQL users error: " + err.message);
        });
    }
};
function Initialize()
{
    return new User();
}

exports.Initialize = Initialize;