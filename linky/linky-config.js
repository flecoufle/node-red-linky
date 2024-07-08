module.exports = function (RED) {
    function LinkyConfigNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.prm = node.credentials.prm;
        this.token = node.credentials.token;
    }
    RED.nodes.registerType("linky-api-config", LinkyConfigNode, {
        credentials: {
            prm: { type: "text" },
            token: { type: "password" }
        }
    });
}