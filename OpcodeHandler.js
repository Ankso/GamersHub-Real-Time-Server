var crypto = require("crypto");
var config = require("./Config.js").Initialize();

var OpcodeHandler = function() {
}

OpcodeHandler.prototype.InitializeSocket = function(socket, users, sessionsConnection, usersConnection) {
    // Add all necessary handlers to the socket
    socket.on("logoff", function(data) {
        // This should never happen
        if (!users[data.userId])
        {
            console.log("Try to logoff the disconnected user " + data.userId + " detected!");
            return;
        }
        if (users[data.userId].sessionId != data.sessionId)
        {
            console.log("User " + data.userId + " has sended an invalid random session ID, logging him off.");
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            return;
        }
        users[data.userId].LogOff(sessionsConnection, usersConnection, users);
    });
    socket.on("chatInvitation", function(data) {
        if (users[data.userId].sessionId != data.sessionId)
        {
            console.log("User " + data.userId + " has sended an invalid random session ID, logging him off.");
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            return;
        }
        if (users[data.friendId])
            users[data.friendId].SendChatInvitation(users[data.userId]);
    });
    socket.on("chatMessage", function(data) {
        if (users[data.userId].sessionId != data.sessionId)
        {
            console.log("User " + data.userId + " has sended an invalid random session ID, logging him off.");
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            return;
        }
        if (users[data.friendId])
            users[data.friendId].SendChatMessage(users[data.userId], data.message);
    });
    socket.on("ping", function(data) {
        if (users[data.userId].sessionId != data.sessionId)
        {
            console.log("User " + data.userId + " has sended an invalid random session ID, logging him off.");
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            return;
        }
        if (users[data.userId])
            if (!users[data.userId].isAfk)
                users[data.userId].UpdateTimeout(sessionsConnection, usersConnection, users);
    });
    socket.on("enableAfk", function(data) {
        if (users[data.userId].sessionId != data.sessionId)
        {
            console.log("User " + data.userId + " has sended an invalid random session ID, logging him off.");
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            return;
        }
        if (users[data.userId])
        {
            users[data.userId].SetAfk(sessionsConnection, usersConnection);
            users[data.userId].UpdateTimeout(sessionsConnection, usersConnection, users, config.USER.MAX_TIME_AFK);
        }
    });
    socket.on("disableAfk", function(data) {
        if (users[data.userId].sessionId != data.sessionId)
        {
            console.log("User " + data.userId + " has sended an invalid random session ID, logging him off.");
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            return;
        }
        if (users[data.userId] && data.password)
        {
            var sha1Sum = crypto.createHash("sha1");
            sha1Sum.update(users[data.userId].username + ":" + data.password);
            var cryptoPass = sha1Sum.digest("hex");
            
            console.log("User " + data.userId + " is trying to unlock his sessios with password: " + cryptoPass);
            if (users[data.userId].passwordSha1 == cryptoPass)
                users[data.userId].UnsetAfk(sessionsConnection, usersConnection);
            else
            {
                console.log("User " + data.userId + " can't unlock his session, incorrect password");
                users[data.userId].socket.emit("afkModeDisabled", { success: false });
            }
        }
    });
    return socket;
}

function Initialize()
{
    return new OpcodeHandler();
}

exports.Initialize = Initialize;