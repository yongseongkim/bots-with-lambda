const { chromium: playwright } = require("playwright-core");
const chromium = require("@sparticuz/chromium");

const ID = "";
const PW = "";

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function buy(browser, numberOfPurchase) {
  const context = await browser.newContext();
  const page = await context.newPage({
    locale: "ko-kr",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    isMobile: false,
  });
  // 동행복권 사이트에서 navigator.platform 으로 모바일 페이지로 리다이렉트 되는 문제 해결
  await page.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "platform", {
      value: "macintel",
    });
  });

  // 로그인
  await page.goto("https://dhlottery.co.kr/user.do?method=login");
  await page.getByPlaceholder("아이디").fill(ID);
  await page.getByPlaceholder("비밀번호").fill(PW);
  await page.locator("form[name='jform'] >> text=로그인").click();
  console.log("로그인 완료", page.url());

  await page.goto("https://el.dhlottery.co.kr/game/TotalGame.jsp?LottoId=LO40");
  const frame = await page.frameLocator("#ifrm_tab");
  // 번호 옵션(혼합, 자동, 직전회차) 선택
  const options = await frame.locator("#tabWay2Buy >> li").all();
  for (const option of options) {
    const contents = await option.allInnerTexts();
    if (contents.some((c) => c.includes("자동번호발급"))) {
      await option.click();
      console.log("자동번호 발급 선택 완료");
      break;
    }
  }
  await frame.locator("#amoundApply").selectOption(`${numberOfPurchase}`);
  await frame.locator("#btnSelectNum").click();
  console.log("수량 선택 완료");

  await frame.locator("#btnBuy").click();

  await frame.locator("#popupLayerConfirm >> text=확인").click();
  console.log("구매 확인");
  await delay(2500);

  console.log("구매 완료");
  console.log(await frame.locator("#buyRound").allInnerTexts());

  // 결과 출력
  const result = await frame.locator("#reportRow >> li").all();
  if (result.length === 0) {
    console.log("구매 기록이 없습니다.");
  } else {
    const messages = Promise.all(
      result.map(async (e) => {
        const contents = await e.allInnerTexts();
        contents.map((c) => (c == "\n" ? " " : c));
        return contents;
      })
    );
    for (const m of await messages) {
      console.log(m);
    }
  }
  await context.close();
}

exports.handler = async (event, context) => {
  let browser = null;
  try {
    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: false,
    });
    await buy(browser, 1);
  } catch (error) {
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
