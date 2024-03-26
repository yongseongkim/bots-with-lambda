// https://docs.upbit.com/reference/%EC%A3%BC%EB%AC%B8%ED%95%98%EA%B8%B0

const accessKey = "";
const secretKey = "";

const request = require("request");
const uuidv4 = require("uuid/v4");
const crypto = require("crypto");
const sign = require("jsonwebtoken").sign;
const queryEncode = require("querystring").encode;

function buy(market, krw) {
  const body = {
    market: market,
    side: "bid", // 매수
    price: `${krw}`,
    ord_type: "price", // 시장가 주문
  };
  const query = queryEncode(body);
  const hash = crypto.createHash("sha512");
  const queryHash = hash.update(query, "utf-8").digest("hex");
  const payload = {
    access_key: accessKey,
    nonce: uuidv4(),
    query_hash: queryHash,
    query_hash_alg: "SHA512",
  };

  const token = sign(payload, secretKey);
  const options = {
    method: "POST",
    url: "https://api.upbit.com/v1/orders",
    headers: { Authorization: `Bearer ${token}` },
    json: body,
  };
  console.log(`trying to buy bitcoin ${krw}won`)

  return new Promise(function (resolve, reject) {
    request(options, (error, response, body) => {
      if (error) reject(error);
      else resolve(body);
    });
  });
}

exports.handler = async function (event) {
  try {
    const result = await buy("KRW-BTC", 100000);
    console.log(result)
    return {
        statusCode: 200,
        body: JSON.stringify('Success'),
    };
  } catch(err) {
    return {
      statusCode: 500,
      body: JSON.stringify(`Fail ${err}`),
    };
  }
};

