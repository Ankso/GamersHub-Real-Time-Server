var crypto = require("crypto");
var config = require("./Config.js").Initialize();

// Client-side opcodes (packets sended by the client)
var ClientOpcodes = {
    OPCODE_NULL                : 0,  // Null opcode, used for testing/debug.
    OPCODE_LOGOFF              : 1,  // Received when the client loggs off.
    OPCODE_PING                : 2,  // Received each time that the client pings the server.
    OPCODE_ENABLE_AFK          : 3,  // Received when AFK mode is enabled client-side.
    OPCODE_DISABLE_AFK         : 4,  // Received when the client tries to disable AFK mode with his or her password.
    OPCODE_CHAT_INVITATION     : 5,  // Received when a client invites other client to a chat conversation.
    OPCODE_CHAT_MESSAGE        : 6,  // Received with each chat message between clients.
    OPCODE_ONLINE_FRIENDS_LIST : 7,  // Received as a request for an online friends list for an user.
    OPCODE_START_PLAYING       : 8,  // Received when a user starts playing.
    OPCODE_STOP_PLAYING        : 9,  // Received when a user stops playing.
    TOTAL_CLIENT_OPCODES_COUNT : 10, // Total opcodes count (Not used by the way).
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
    
    // TODO: May be we must move some operational code from here to specific functions.
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
                usersConnection.query("SELECT b.id, b.username, c.avatar_path FROM user_friends AS a, user_data AS b, user_detailed_data as c WHERE a.user_id = ? AND a.friend_id = b.id AND b.id = c.user_id AND b.is_online = 1 ORDER BY b.username",
                                      [data.userId], function(err, results, fields) {
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
                                avatarPath: results[i].avatar_path,
                            };
                            // Check if the user is playing something, and if he is, send the additional data
                            if (users[results[i].id])
                            {
                                if (users[results[i].id].isPlaying)
                                {
                                    friendsList[i].isPlaying = true;
                                    friendsList[i].gameInfo = users[results[i].id].gameInfo;
                                }
                                else
                                    friendsList[i].isPlaying = false;
                            }
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
        case ClientOpcodes.OPCODE_START_PLAYING:
            if (users[data.userId])
            {
                console.log("User " + data.userId + " started playing game: " + data.gameId + " (" + data.gameTitle + ").");
                users[data.userId].SetPlaying(true, data.gameId, data.gameTitle, data.gameImagePath);
                usersConnection.query("SELECT a.id FROM user_data AS a, user_friends AS b WHERE b.user_id = ? AND b.friend_id = a.id AND a.is_online = 1",
                                      [data.userId], function(err, results, fields) {
                    if (err)
                        console.log("MySQL users error: " + err.message);
                    
                    for (var i in results)
                    {
                        if (users[results[i].id])
                            users[results[i].id].SendFriendStartsPlaying(data.userId, data.gameId, data.gameTitle, data.gameImagePath);
                    }
                });
                
            }
            break;
        case ClientOpcodes.OPCODE_STOP_PLAYING:
            if (users[data.userId])
            {
                console.log("User " + data.userId + " stoped playing game: " + users[data.userId].gameInfo.id + " (" + users[data.userId].gameInfo.title + ").");
                users[data.userId].SetPlaying(false);
                usersConnection.query("SELECT a.id FROM user_data AS a, user_friends AS b WHERE b.user_id = ? AND b.friend_id = a.id AND a.is_online = 1",
                                      [data.userId], function(err, results, fields) {
                    if (err)
                        console.log("MySQL users error: " + err.message);
                    
                    for (var i in results)
                    {
                        if (users[results[i].id])
                            users[results[i].id].SendFriendStopsPlaying(data.userId);
                    }
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