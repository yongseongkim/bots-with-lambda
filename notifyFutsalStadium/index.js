// https://futsalbase.com/api/reservation/allList?stadium=A&date=2024-09-08 // 1
// https://futsalbase.com/api/reservation/allList?stadium=B&date=2024-09-08 // 2
// https://futsalbase.com/api/reservation/allList?stadium=C&date=2024-09-08 // 3
// https://futsalbase.com/api/reservation/allList?stadium=D&date=2024-09-08 // 7
// https://futsalbase.com/api/reservation/allList?stadium=E&date=2024-09-08 // 6
// https://futsalbase.com/api/reservation/allList?stadium=F&date=2024-09-08 // 실내구장
// https://futsalbase.com/api/reservation/allList?stadium=H&date=2024-09-08 // 4
// https://futsalbase.com/api/reservation/allList?stadium=I&date=2024-09-08 // 5
const axios = require('axios');
const moment = require('moment');
const SlackNode = require("slack-node");
const slack = new SlackNode();
slack.setWebhook("https://hooks.slack.com/services/XXX");

exports.handler = async (event) => {
    const nextWeekends = await getNextWeekends(4);  // Get the next 4 weekend days
    let messageContent = "Futsal Stadium Availability for Upcoming Weekends:\n\n";

    for (const date of nextWeekends) {
        await sleep(500)
        const results = await crawlFutsalSchedules(date);
        messageContent += `*${date.format('YYYY-MM-DD')} (${date.format('dddd')}):*\n`;
        if (results.length > 0) {
            results.forEach(slot => {
                messageContent += `• ${slot.stadium} - ${slot.time} - ${slot.price} KRW\n`;
            });
        } else {
            messageContent += "No available slots\n";
        }
        messageContent += "\n";
    }
    console.info(messageContent)
    send(messageContent)
    const response = {
        statusCode: 200,
        body: messageContent,
    };
    return response;
};

async function crawlFutsalSchedules(date) {
    const baseUrl = "https://futsalbase.com/api/reservation/allList";
    const stadiums = {
        "A": "1번 구장",
        "B": "2번 구장",
        "C": "3번 구장",
        "D": "7번 구장",
        "E": "6번 구장",
        // "F": "실내 구장",
        "H": "4번 구장",
        "I": "5번 구장"
    };

    const availableSlots = [];

    for (const [stadiumCode, stadiumName] of Object.entries(stadiums)) {
        const params = {
            stadium: stadiumCode,
            date: date.format('YYYY-MM-DD')
        };

        try {
            await sleep(200)
            const response = await axios.get(baseUrl, { params });
            const data = response.data;

            console.info(`${stadiumCode} ${data.message}.`)

            if (data.status === 1 && data.message === "success") {
                data.data.forEach(slot => {
                    if (!slot.szDInfo && slot.strtime) {
                        const [startTime, endTime] = slot.strtime.split('~').map(t => moment(t.trim(), 'HH:mm'));
                        // 23:00 ~ 01:00 의 경우는 무시한다.
                        if (startTime > endTime) return
                        if (startTime.isSameOrAfter(moment('09:00', 'HH:mm')) && endTime.isSameOrBefore(moment('14:00', 'HH:mm'))) {
                            availableSlots.push({
                                stadium: stadiumName,
                                date: slot.ssdate,
                                time: slot.strtime.trim(),
                                price: slot.nnprice
                            });
                        }
                    }
                });
            }
        } catch (error) {
            console.error(`Error fetching data for stadium ${stadiumCode}:`, error.message);
        }
    }

    return availableSlots;
}

function getNextWeekends(count) {
    const weekends = [];
    // 이번주는 무시한다.
    let nowPlus1Week = moment().add(1, 'week').startOf('week');

    while (weekends.length < count) {
        if (nowPlus1Week.day() === 0 || nowPlus1Week.day() === 6) {  // 0 is Sunday, 6 is Saturday
            weekends.push(nowPlus1Week.clone());
        }
        nowPlus1Week.add(1, 'day');
    }

    return weekends;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 슬랙 알람
const send = async (content) => {
    slack.webhook(
        {
            username: "adidas the base",
            icon_emoji: ":soccer:",
            attachments: [
                {
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": content
                            }
                        }
                    ]
                }
            ]
        },
        function (err, response) {
            console.log(response);
        }
    )
}
