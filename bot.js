var TelegramBot = require('node-telegram-bot-api');
var request = require('request');
var moment = require('moment');
var fs = require('fs');

var token = fs.readFileSync('telegram-token', 'utf8').trim();
var bot = new TelegramBot(token, {polling: true});

function convert_to_textual(data, is_html) {

   html = is_html || false;

   brandstof0 = data['brandstof'][0]['brandstof_omschrijving'];
   brandstof1 = (data['brandstof'][1] !== undefined ? ' / ' + data['brandstof'][1]['brandstof_omschrijving'] : '');
   cilinderinhoud = (data['cilinderinhoud'] !== undefined ? (Math.round(data['cilinderinhoud'] / 100) / 10) + 'L' : '');
   cilinders = (data['aantal_cilinders'] !== undefined ? ' V' + data['aantal_cilinders'] : '');
   
   pk = '';
   if (data['brandstof'][0]['nettomaximumvermogen'] !== undefined)
       pk = Math.round(data['brandstof'][0]['nettomaximumvermogen'] * 1.362);
   else if (data['brandstof'][0]['nominaal_continu_maximumvermogen'] !== undefined)
       pk = Math.round(data['brandstof'][0]['nominaal_continu_maximumvermogen'] * 1.362);

   bouwjaar = data['datum_eerste_toelating'].slice(0, 4);
   prijs = (data['catalogusprijs'] !== undefined ? 'nieuwprijs: € ' + data['catalogusprijs'].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ',-' : '');

   reply = [
        data['inrichting'] + ' - ' + data['massa_rijklaar'] + 'kg',
        brandstof0 + brandstof1 + ' ' + cilinderinhoud + cilinders + ' - ' + pk + 'pk',
        'bouwjaar: ' + bouwjaar,
        prijs
   ]

   return reply.join('\n');

}

function default_reply(msg_id, formatted_in) {

    formatted = formatted_in || '';

    r = {
        type        : 'article',
        id          : '1',
        cache_time  : 0,
        title       : 'Vehicle not found or licenseplate incomplete',
        description : 'Please check queried data, input: ' + formatted,
        message_text: 'Vehicle not found'
    }

    bot.answerInlineQuery(msg_id, [r]);

}

bot.onText(/\/(start|help)/, function(msg, match) {

    var text = 'This bot can give information about Dutch cars.';

    bot.sendMessage(msg.from.id, text);

});

bot.onText(/^(?!\/).+$/, function(msg, match) {

    fmt_query = match[0].replace(/-/g, '').replace(/ /g, '');

    console.log(msg.from.first_name, msg.from.last_name, "-", match[0]);
    console.log('formatted: ', fmt_query);

    if (fmt_query.length > 5) {

        rdw_call(fmt_query, function(data) {

            if (data == undefined || data == []) {
                bot.sendMessage(msg.from.id, 'Vehicle not found');
                return;
            }

            bot.sendMessage(msg.from.id, data[0]['kenteken'] + "\n" +
                data[0]['merk'] + ' ' + data[0]['handelsbenaming'] + "\n" +
                convert_to_textual(data[0], true));
            console.log('succes');

        });

    } else if (fmt_query == 'last') {

        latest_call(function(lic) {

            bot.sendMessage(msg.from.id, 'Last licenseplate: ' + lic);
            console.log('succes');

        });

    } else {

        bot.sendMessage(msg.from.id, 'Too short for a licenseplate');

    }

});

bot.on('inline_query', function(msg) {

    console.log('inline_query', msg.from.first_name, msg.from.last_name, "-", msg.query);

    result = [];
    fmt_query = msg.query.replace(/-/g, '').replace(/ /g, '');

    console.log('formatted: ', fmt_query);

    if (fmt_query.length > 5) {

        rdw_call(fmt_query, function(data) {

            if (data == undefined || data == []) {
                default_reply(msg.id, fmt_query);
                return;
            } 

            r = {
                type        : 'article',
                id          : data[0]['kenteken'],
                title       : data[0]['merk'] + ' ' + data[0]['handelsbenaming'],
                description : convert_to_textual(data[0]),
                cache_time  : 0,
                parse_mode  : 'HTML',
                message_text: '<b>' + data[0]['merk'] + ' ' + data[0]['handelsbenaming'] + '</b>' + ' ' +
                    '<i>' + data[0]['kenteken'] + '</i>\n' + 
                    convert_to_textual(data[0])
            }

            bot.answerInlineQuery(msg.id, [r]);

        });

    } else {

        default_reply(msg.id, fmt_query);

    }

});

function rdw_call(q, callback) {

    query_suffix = '$where=(UPPER(kenteken)=UPPER(%27' + q + '%27))';

    options = {
        url: 'https://opendata.rdw.nl/api/id/m9d7-ebf2.json?' + query_suffix,
        headers : {}
    }

    request(options, function(error, resp, body) {

        try {
            d = JSON.parse(body);
        } catch(err) {
            console.log('error rdw_call', q, err);
            callback(undefined);
            return;
        }

        if (d.length == 0) {
            callback(undefined);
            return;
        }

        options = {
            url: d[0]['api_gekentekende_voertuigen_brandstof'] + '?' + query_suffix,
            headers: {}
        }

        request(options, function(error, resp, body) {

            try {
                b = JSON.parse(body);
                d[0]['brandstof'] = b;
            } catch(err) {
                console.log('error rdw_call brandstof', q, err);
                callback(undefined);
                return;
            }

            callback(d);

        });

    });

}

function latest_call(callback) {

    options = {
        url : 'https://www.rdw.nl/restapi/lukapi/get?vehicle=1',
        headers : {}
    }

    request(options, function(error, resp, body) {

        try {
            d = JSON.parse(body);
        } catch(err) {
            console.log('error lastest_call', err);
            callback(undefined);
            return;
        }

        callback(d[0].code);

    });

}
