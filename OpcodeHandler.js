var crypto = require("crypto");
var config = require("./Config.js").Initialize();

// Client-side opcodes (packets sended by the client)
var ClientOpcodes = {
    OPCODE_NULL               : 0, // Null opcode, used for testing/debug.
    OPCODE_LOGOFF             : 1, // Received when the client loggs off.
    OPCODE_PING               : 2, // Received each time that the client pings the server.
    OPCODE_ENABLE_AFK         : 3, // Received when AFK mode is enabled client-side.
    OPCODE_DISABLE_AFK        : 4, // Received when the client tries to disable AFK mode with his or her password.
    OPCODE_CHAT_INVITATION    : 5, // Received when a client invites other client to a chat conversation.
    OPCODE_CHAT_MESSAGE       : 6, // Received with each chat message between clients.
    TOTAL_CLIENT_OPCODES_COUNT: 7, // Total opcodes count (Not used by the way).
};
// Server-side opcodes (packets sended by the Server)
var ServerOpcodes = {
    // Not used by the way
};

var OpcodeHandler = function() {
}

/**
 * Main Function of the Opcode Handler. It links the received opcodes with their associated actions.
 * @param data object The data sended by the client. It must have, at least, the opcode, the user ID and the random session ID of the client.
 * @param users array The users array that stores all online users.
 * @param sessionsConnection object The connection to the sessions DB.
 * @param usersConnection object The connection to the users DB.
 * @return boolean Returns true if the packet is processed successfully, false otherwise.
 */
OpcodeHandler.prototype.ProcessPacket = function(data, users, sessionsConnection, usersConnection)
{
    if (!data.opcode)
    {
        console.log("Received invalid packet with no opcode.");
        return false;
    }
    
    if (!data.sessionId)
    {
        console.log("Received invalid packet with no random session ID attached.");
        return false;
    }
    
    if (!data.userId)
    {
        console.log("Received invalid packet with no user ID attached.");
        return false;
    }
    
    if (users[data.userId].sessionId != data.sessionId)
    {
        console.log("Received invalid random session ID from user " + data.userId + ", logging him off.");
        users[data.userId].LogOff(sessionsConnection, usersConnection, users);
        return false;
    }
    
    // TODO: May be we must move some operational code from here specific functions.
    switch(data.opcode)
    {
        case ClientOpcodes.OPCODE_NULL:
            // Only for testing purposes
            console.log("Received NULL opcode from user " + data.userId);
            break;
        case ClientOpcodes.OPCODE_LOGOFF:
            // This should never happen
            if (!users[data.userId])
            {
                console.log("Try to logoff the disconnected user " + data.userId + " detected!");
                return;
            }
            users[data.userId].LogOff(sessionsConnection, usersConnection, users);
            break;
        case ClientOpcodes.OPCODE_PING:
            if (users[data.userId])
                if (!users[data.userId].isAfk)
                    users[data.userId].UpdateTimeout(sessionsConnection, usersConnection, users);
            break;
        case ClientOpcodes.OPCODE_ENABLE_AFK:
            if (users[data.userId])
            {
                users[data.userId].SetAfk(sessionsConnection, usersConnection);
                users[data.userId].UpdateTimeout(sessionsConnection, usersConnection, users, config.USER.MAX_TIME_AFK);
            }
            break;
        case ClientOpcodes.OPCODE_DISABLE_AFK:
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
            break;
        case ClientOpcodes.OPCODE_CHAT_INVITATION:
            if (users[data.friendId])
                users[data.friendId].SendChatInvitation(users[data.userId]);
            break;
        case ClientOpcodes.OPCODE_CHAT_MESSAGE:
            if (users[data.friendId])
                users[data.friendId].SendChatMessage(users[data.userId], data.message);
            break;
        default:
            console.log("Received unhandled opcode " + data.opcode + " from user " + data.userId + " with RNDSESSID " + data.sessionId);
            return false;
    }
    return true;
}

function Initialize()
{
    return new OpcodeHandler();
}

exports.Initialize = Initialize;