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
  request(options, (error, response, body) => {
    if (error) console.log(error);
    else console.log(body);
  });
}

buy("KRW-BTC", 100000);

