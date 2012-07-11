function Config() {
    this.MYSQL = {
        // The var names can't be in captial letter because the object
        // is directly used by the MySQL module and it's valid only in lower case.
        host    : "localhost",
        user    : "root",
        password: "password",
    }
    this.USER = {
        // Maximun time between pings from the client. After this
        // time without ping, the server will logg off the user (in ms).
        // Be aware that the client must have his configuration options
        // properly set.
        MAX_TIME_BETWEEN_PINGS: 20000,   // 20 seconds.
        
        // THe maximun time that an user can be in AFK state before
        // being logged off by the server. 30 minutes or more recommended.
        MAX_TIME_AFK          : 1800000, // 30 minutes.
    }
}

function Initialize() {
    return new Config();
}

exports.Initialize = Initialize;