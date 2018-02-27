const telegramBot = require('node-telegram-bot-api');
const {config} = require('./config.js');
const models = require('./models');
const _ = require('lodash');
const request = require('request');
const rp = require('request-promise');

let bot = new telegramBot(config.token, {
    webHook: {
        port: process.env.PORT
    }
});
let emojiEyes = '👀';
let emojiBaloon = '💬';
let emojiBar = '📊';
let commandList = {
    'setdefaultboard': setDefaultBoard,
    'gettopthreads': getTopThreads
};

const url = process.env.APP_URL || 'https://topthreads.herokuapp.com:443';
bot.setWebHook(`${url}/bot${config.token}`);
bot.getMe().then(function (me) {
    bot.me = me;
});

models.sequelize.sync().then(function () {
    bot.on('message', onNewMessage);
}, function (error) {
    console.log(error);
});

function onNewMessage(msg) {
    if (!msg.entities || !_.size(_.find(msg.entities, {type: 'bot_command', offset: 0}))) {
        return;
    }

    if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
        if (!_.includes(msg.text, bot.me.username)) {
            return;
        }
    }

    let commandEntity = _.find(msg.entities, {type: 'bot_command', offset: 0});
    let command = _.trim(msg.text.substr(commandEntity.offset, commandEntity.length).split('@')[0].substr(1));
    msg.text = msg.text.substr(commandEntity.length + 1);

    if(commandList[command]) {
        commandList[command](msg);
    }

}

async function setDefaultBoard(msg) {
    let newBoard = msg.text;
    let chat = await models.Chat.getChat(msg);

    if (!newBoard) {
        return bot.sendMessage(msg.chat.id, 'Default board for this chat is ' + chat.get('defaultBoard'), {
            reply_to_message_id: msg.message_id
        });
    }

    if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
        let admins = await bot.getChatAdministrators(msg.chat.id);
        let user = _.find(admins, function (admin) {
            return admin.user.id === msg.from.id
        });

        console.log(admins);

        if (!user) {
            return bot.sendMessage(msg.chat.id, 'Only power users are allowed to change this setting', {
                reply_to_message_id: msg.message_id
            });
        }
    }

    request({
        url: 'http://2ch.hk/' + newBoard + '/threads.json',
        followAllRedirects: true
    }, function (err) {
        if (!err) {
            chat.set('defaultBoard', newBoard);
            chat.save();
            bot.sendMessage(msg.chat.id, 'Setting default board to ' + newBoard, {
                reply_to_message_id: msg.message_id
            });
        } else {
            return bot.sendMessage(msg.chat.id, 'Could not retrieve top threads for board /' + board, {
                reply_to_message_id: msg.message_id
            });
        }
    });

}

async function getTopThreads(msg) {
    let board = msg.text;
    let chat = await models.Chat.getChat(msg);


    getBoardTops(board || chat.get('defaultBoard')).then(function (tops) {
        console.log(tops);
        return bot.sendMessage(msg.chat.id, tops, {
            reply_to_message_id: msg.message_id,
            disable_web_page_preview: true,
            parse_mode: 'HTML'
        });
    });
}

async function getBoardTops(board) {
    let result = await rp({
        url: 'http://2ch.hk/' + board + '/threads.json',
        followAllRedirects: true,
        json: true
    });
    let threads = result.threads;
    threads.splice(10, threads.length);
    threads = _(threads).orderBy('score', ['desc']).take(10).value();
    return _.map(threads, (thread) => {
        return threadToString(result.board, thread);
    }).join('\n');
}

function threadToString(board, thread) {
    let string = '';
    string += '<a href="https://2ch.hk/' + board +'/res/' + thread.num + '.html">' + thread.subject + '</a>\n';
    string += emojiEyes + roundStat(thread.views) + ' ' + emojiBaloon + roundStat(thread.posts_count) + ' ' + emojiBar + roundStat(thread.score) + '\n';
    return string;
}

function roundStat(num) {
    return Math.round(num * 100) / 100;
}