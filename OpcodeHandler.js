var crypto = require("crypto");
var config = require("./Config.js").Initialize();

// Client-side opcodes (packets sended by the client)
var ClientOpcodes = {
    OPCODE_NULL                : 0, // Null opcode, used for testing/debug.
    OPCODE_LOGOFF              : 1, // Received when the client loggs off.
    OPCODE_PING                : 2, // Received each time that the client pings the server.
    OPCODE_ENABLE_AFK          : 3, // Received when AFK mode is enabled client-side.
    OPCODE_DISABLE_AFK         : 4, // Received when the client tries to disable AFK mode with his or her password.
    OPCODE_CHAT_INVITATION     : 5, // Received when a client invites other client to a chat conversation.
    OPCODE_CHAT_MESSAGE        : 6, // Received with each chat message between clients.
    OPCODE_ONLINE_FRIENDS_LIST : 7, // Received as a request for an online friends list for an user.
    TOTAL_CLIENT_OPCODES_COUNT : 8, // Total opcodes count (Not used by the way).
};
// Server-side opcodes (packets sended by the Server)
var ServerOpcodes = {};

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
    
    if (!users[data.userId])
    {
        console.log("Trying to access non existent user " + data.userId + ", Opcode: " + data.opcode);
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
            // Only for debug purposes
            console.log("Received NULL opcode from user " + data.userId);
            break;
        case ClientOpcodes.OPCODE_LOGOFF:
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
        case ClientOpcodes.OPCODE_ONLINE_FRIENDS_LIST:
            if (users[data.userId])
            {
                console.log("User " + data.userId + " is asking for his online friends, creating response...");
                usersConnection.query("SELECT b.id, b.username FROM user_friends AS a, user_data AS b WHERE a.user_id = ? AND a.friend_id = b.id AND b.is_online = 1 ORDER BY b.username", data.userId, function(err, results, fields) {
                    if (err)
                        console.log("MySQL error: " + err.message);
                    
                    var friendsList = new Array();
                    
                    if (results[0])
                    {
                        for (var i in results)
                        {
                            friendsList[i] = {
                                id: results[i].id,
                                userName: results[i].username,
                            };
                        }
                        console.log("User " + data.userId + " has " + i - 1 + " online friends, sending list.");
                    }
                    else
                    {
                        friendsList[0] = "NO_ONLINE_FRIENDS";
                        console.log("User " + data.userId + " has no online friends.");
                    }

                    users[data.userId].socket.emit("onlineFriendsList", { friendsList: friendsList});
                });
            }
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