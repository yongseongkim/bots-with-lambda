const axios = require("axios");
const SlackNode = require("slack-node");

const slack = new SlackNode();
slack.setWebhook(
    "https://hooks.slack.com/services/xxx"
);

// 네이버 검색 (https://cafe.naver.com/ca-fe/home/search/c-articles?q=%EB%B2%A0%EC%8A%A4%ED%8C%8C&od=1&wp=3m&cn=3000000&cx=4500000)
const getArticles = async(keyword, minpricekrw, maxpricekrw) => {
    try {
        // https://apis.naver.com/cafe-web/cafe-search-api/v4.0/trade-search/all?query=${keyword}&page=1&size=10&recommendkeyword=true&searchorderparamtype=date_desc&writetime.min=20230214224332&cost.min=3000000&cost.max=4500000
        const url = encodeuri(`https://apis.naver.com/cafe-web/cafe-search-api/v4.0/trade-search/all?query=${keyword}&page=1&size=10&recommendkeyword=true&searchorderparamtype=date_desc&cost.min=${minpricekrw}&cost.max=${maxpricekrw}`)
        const response = await axios.get(url)
        const list = response.data["result"]["tradearticlelist"]
        const items = list
            .filter(a => a.type === "article")
            .map(a => a.item)
            .map(i => {
                console.log(i.thumbnailimageurl)
                return {
                    "url": `https://cafe.naver.com/${i.cafeurl}/${i.articleid}`,
                    "title": i.subject,
                    "content": i.content,
                    "thumbnail": i.thumbnailimageurl,
                    "pricekrw": i.productsale && i.productsale.cost,
                    "tradelocation": ""
                }
            })
        for await (const i of items) {
            send(i.url, i.title, i.content, i.thumbnail, i.pricekrw, i.tradelocation)
        }
    } catch(err) {
        console.log("error: ", err);
    }
}

// 슬랙 알람
const send = async(url, title, content, thumbnail, pricekrw, tradelocation) => {
    slack.webhook(
        {
            username: "vespacrawler",
            icon_emoji: ":motor_scooter:",
            attachments: [
                {
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": `<${url}|${title}> \n ${content}`
                            },
                            "accessory": {
                                "type": "image",
                                "image_url": thumbnail,
                                "alt_text": "thumbnail"
                            }
                        },
                        {
                            "type": "section",
                            "fields": [
                                {
                                    "type": "mrkdwn",
                                    "text": `*가격:* ${pricekrw}`
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "fields": [
                                {
                                    "type": "mrkdwn",
                                    "text": `*거래장소:* tradelocation`
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        function(err, response){
            console.log(response);
        }
    )
}

getArticles("베스파", 3000000, 4500000)

