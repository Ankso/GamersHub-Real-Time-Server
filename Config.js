function Config() {
    this.mysql = {
        host    : "localhost",
        user    : "root",
        password: "password",
    }
}

function Initialize() {
    return new Config();
}

exports.Initialize = Initialize;