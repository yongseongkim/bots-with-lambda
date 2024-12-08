import chromium from '@sparticuz/chromium';
import fs from "fs";
import puppeteer from 'puppeteer-core';

const delay = async (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

class CourtAuctionCrawler {
  constructor(browser, siDoCode) {
    this.browser = browser;
    this.siDoCode = siDoCode;
    this.page = null;
    this.frame = null;
    this.numberOfElementsInPage = 0;
  }

  async initialize() {
    const page = await this.browser.newPage(
      {
        locale: "ko-kr",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        isMobile: false,
      }
    );
    await page.goto('https://www.courtauction.go.kr', { waitUntil: 'load' });
    page.on('console', (msg) => {
      console.log('system message: ', msg.text())
    })
    this.page = page
  }

  async getIndexFrame() {
    let frames = await Promise.all(
      this.page.frames().map(
        async (frame) => {
          const element = await frame.frameElement();
          if (element) {
            const name = await element.evaluate(e => e.name);
            if (name === 'indexFrame') return frame
          }
          return null
        }
      )
    )
    const frame = frames ? frames.filter(f => f !== null)[0] : null
    this.frame = frame
    return frame
  }

  async goToListPage() {
    const indexFrame = await this.getIndexFrame()
    await indexFrame.waitForSelector('div#qk_srch_form')
    await indexFrame.select('#idJiwonNm1', '전체')
    await indexFrame.select('#idSidoCode1', this.siDoCode)

    // 법원/지역을 선택하고 바로 '검색' 을 클릭하면 동작하지 않아 잠깐의 딜레이를 준다.
    await delay(500)
    await indexFrame.waitForSelector('div#main_btn')
    await indexFrame.click('div#main_btn')
  }

  async getPageNumbersInListPage() {
    const getLastPageNumber = () => {
      const lastPageImg = document.querySelector("img[alt='마지막 쪽']");
      let lastPageNumber = 1; // Default to 1 if not found

      if (lastPageImg) {
        const parentATag = lastPageImg.closest("a");
        if (parentATag) {
          const onClickAttr = parentATag.getAttribute("onclick");
          const match = onClickAttr.match(/goPage\('(\d+)'\)/);
          if (match) {
            lastPageNumber = parseInt(match[1], 10);
          }
        }
      }
      return lastPageNumber
    }

    // 법원경메에서 페이지는 1, 21, 41, ... 식으로 이동
    const lastPageNumber = await this.frame.evaluate(getLastPageNumber)
    return Array.from({ length: Math.ceil(lastPageNumber / 20) }, (_, i) => i);
  }

  async goToListPageN(n) {
    await this.frame.evaluate((pageNumber) => {
      if (typeof goPage === 'function') {
        return goPage(pageNumber * 20 + 1);
      }
    }, n)
  }

  async goPrevFromDetail() {
    await this.frame.evaluate(() => {
      if (typeof porBefSrnActSubmit === 'function') {
        return porBefSrnActSubmit();
      }
    })
  }

  async run() {
    const result = []
    const getAuctionData = () => {
      const tables = document.querySelectorAll('table.Ltbl_dt');
      const data = {};
      const locations = []; // 목록 N 소재지를 저장할 리스트

      // 필요없는 공백 제거하기
      const cleanText = (text) => {
        if (!text) return null;
        return text.replace(/[\t\n]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/&nbsp;/g, ' ').trim();
      };

      for (const table of tables) {
        const rows = table.querySelectorAll('.Ltbl_dt tbody tr');

        const summary = table.getAttribute('summary');

        if (summary.includes('물건기본정보')) {
          // 상세화면에서 썸네일을 원본 이미지로 변환한다
          // /DownFront?spec=default&dir=kj/2023/0525&filename=T_B0002102023013000212213.jpg&downloadfilename=T_B0002102023013000212213.jpg
          // /DownFront?spec=default&dir=kj/2023/0525&filename=B0002102023013000212213.jpg&downloadfilename=B0002102023013000212213.jpg
          if (summary.includes('사진정보')) {
            const transformUrl = (url) => {
              // Parse the URL into its components
              const urlObj = new URL(url);

              // Extract and modify the `filename` parameter
              const filename = urlObj.searchParams.get('filename');
              if (filename && filename.startsWith('T_')) {
                urlObj.searchParams.set('filename', filename.replace('T_', ''));
              }

              // Extract and modify the `downloadfilename` parameter
              const downloadFilename = urlObj.searchParams.get('downloadfilename');
              if (downloadFilename && downloadFilename.startsWith('T_')) {
                urlObj.searchParams.set('downloadfilename', downloadFilename.replace('T_', ''));
              }

              // Return the updated URL as a string
              return urlObj.toString();
            }

            const images = table.querySelectorAll('li img');
            data['사진정보'] = Array.from(images)
              .map(img => transformUrl(img.src)) // Extract the `src` attribute
              .filter(src => src); // Filter out empty or invalid `src`
          } else {
            rows.forEach((row) => {
              const thElements = row.querySelectorAll('th');
              const tdElements = row.querySelectorAll('td');

              thElements.forEach((th, index) => {
                const key = cleanText(th.textContent);
                if (key && tdElements[index]) {
                  const value = cleanText(tdElements[index].textContent);

                  if (key.includes('사건번호')) {
                    const [id, isElectronic] = value.split('[전자]', 2); // Limit split to 2 parts
                    data[key] = cleanText(id);
                    data['전자'] = isElectronic !== undefined;
                  } else if (key.includes('목록') && key.includes('소재지')) {
                    // '목록 N 소재지'를 따로 처리
                    locations.push({ [key]: value });
                  } else {
                    data[key] = value;
                  }
                }
              });
            });
          }
        }

        if (summary.includes('기일내역')) {
          const headers = Array.from(document.querySelectorAll('table.Ltbl_list thead th')).map(th => th.textContent.trim());
          const rows = Array.from(document.querySelectorAll('table.Ltbl_list tbody tr')).map(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => cleanText(td.textContent));
            return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
          });
          data['기일내역'] = rows
        }

        if (summary.includes('목록내역')) {
          const headers = Array.from(document.querySelectorAll('table.Ltbl_list thead th')).map(th => th.textContent.trim());
          const rows = Array.from(document.querySelectorAll('table.Ltbl_list tbody tr')).map(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => cleanText(td.textContent));
            return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
          });
          data['목록내역'] = rows
        }

        if (summary.includes('감정평가요항')) {
          const items = document.querySelectorAll('table.Ltbl_dt ul.no_blt > li');
          data['감정평가요항표'] = Array.from(items).map(item => {
            const title = item.querySelector('.law_title')?.textContent.trim();
            const description = item.querySelector('ul li span')?.textContent.trim();
            if (title && description) {
              return { title: cleanText(title), description: cleanText(description) };
            }
            return null
          }).filter(value => value != null);
        }
      }
      data['목록소재지'] = locations; // 목록 N 소재지를 별도로 추가
      return data;
    }

    console.log(`- 법원경매정보 크롤링 시작(code: ${this.siDoCode})`)

    await this.goToListPage()
    console.log(`  리스트 페이지(code: ${this.siDoCode})로 이동`)

    const frame = await this.getIndexFrame()
    if (!frame) {
      console.log(`  페이지(code: ${this.siDoCode})를 로드할 수 없습니다.`)
      return
    }
    await frame.waitForSelector('.table_contents')

    const pageNumbers = await this.getPageNumbersInListPage()
    console.log(`  총 ${pageNumbers.length} 페이지 요소들 가져오기`)

    for (const pageNumber of pageNumbers) {
      console.log(`    ${pageNumber + 1}번째 페이지 이동`)
      await this.goToListPageN(pageNumber)
      await delay(1500)

      // 한 페이지에 경매 물품 갯수 가져오기
      const numberOfElementsInPage = (await frame.$$('#contents .Ltbl_list tbody tr')).length
      console.log(`      ${numberOfElementsInPage} 개 요소 가져오기`)

      for (const idx of Array(numberOfElementsInPage).keys()) {
        const aTags = await this.frame.$$('#contents .Ltbl_list tbody tr');
        const aTag = await aTags[idx].$('.txtleft a');
        const address = await aTag.evaluate((el) => el.textContent.trim());

        await aTag.click();
        console.log(`      경매(${address}) 클릭`);
        await frame.waitForSelector('#contents')
        await delay(1500)

        // 경매 정보 가져오기 
        const auctionData = await frame.evaluate(getAuctionData);
        result.push(auctionData)

        const auctionDataString = JSON.stringify(auctionData)
        console.log(`        경매 데이터 가져오기 성공 (${auctionDataString.length > 40 ? `${auctionDataString.slice(0, 20)} ... ${auctionDataString.slice(-20)}` : auctionDataString})`)

        // 이전 페이지로 이동
        await this.goPrevFromDetail()
        await delay(1500)
      }
    }

    try {
      fs.writeFileSync('data.json', JSON.stringify(result, null, 1));
    } catch (err) {
      console.error('  법원경매정보 파일 쓰기 실패', err);
    }

    console.log(`- 법원경매정보 크롤링 끝(code: ${this.siDoCode})`)
  }

  async close() {
    if (this.page) {
      await this.page.close();
    }
  }
}

export const handler = async () => {
  // identify whether we are running locally or in AWS
  const isLocal = process.env.AWS_EXECUTION_ENV === undefined;
  const browser = await puppeteer.launch({
    args: isLocal ? undefined : chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: isLocal ? '/opt/homebrew/bin/chromium' : await chromium.executablePath(),
    headless: isLocal ? false : chromium.headless,
  });
  const siDoCodes = [
    '11', // 서울특별시
    // '26', // 부산광역시
    // '27', // 대구광역시
    // '28', // 인천광역시
    // '29', // 광주광역시
    // '30', // 대전광역시
    // '31', // 울산광역시
    // '36', // 세종특별자치시
    // '41', // 경기도
    // '42', // 강원도
    // '43', // 충청북도
    // '44', // 충청남도
    // '45', // 전라북도
    // '46', // 전라남도
    // '47', // 경상북도
    // '48', // 경상남도
    // '50', // 제주특별자치도
    // '51', // 강원특별자치도
    // '52', // 전북특별자치도
  ]
  for (const sidoCode of siDoCodes) {
    const crawler = new CourtAuctionCrawler(browser, sidoCode)
    await crawler.initialize()
    await crawler.run()
    await crawler.close()
  }
  await browser.close();
}