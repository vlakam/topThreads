'use strict';

module.exports = function (sequelize, DataTypes) {
    let Chat = sequelize.define('Chat', {
        telegramId: DataTypes.STRING,
        defaultBoard: DataTypes.STRING
    }, {
        classMethods: {
            getChat: async function (tg_message) {
                let response = await Chat.findOrCreate({
                    where: {
                        telegramId: tg_message.chat.id.toString()
                    },
                    defaults: {
                        defaultBoard: 'b'
                    }
                });

                return response[0];
            }
        }
    });
    return Chat;
};