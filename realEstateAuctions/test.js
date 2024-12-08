const { default: chromium } = await import("@sparticuz/chromium");
const { default: puppeteer } = await import("puppeteer-core");

const delay = async (milliseconds) => {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

const openListPage = async (browser, siDoCode) => {
    const page = await browser.newPage(
        {
            locale: "ko-kr",
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            isMobile: false,
        }
    );
    page.on('console', (msg) => {
        console.log(msg.text())
    });
    await page.goto('https://www.courtauction.go.kr', { waitUntil: 'load' });

    let frames = await Promise.all(
        page.frames().map(
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

    if (frames) {
        const indexFrame = frames.filter(f => f !== null)[0]
        await indexFrame.waitForSelector('div#qk_srch_form')
        await indexFrame.select('#idJiwonNm1', '전체')
        await indexFrame.select('#idSidoCode1', siDoCode)
        console.log(`법원경매정보 페이지 가져오기 시작 ${siDoCode}`)

        // 법원/지역을 선택하고 바로 '검색' 을 클릭하면 동작하지 않아 잠깐의 딜레이를 준다.
        await delay(500)
        await indexFrame.waitForSelector('div#main_btn')
        await indexFrame.click('div#main_btn')
        return indexFrame
    }
    return page
}

const getPageNumbers = async (frame) => {
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

    const lastPageNumber = await frame.evaluate(getLastPageNumber)
    console.log(`The last page number is ${lastPageNumber}`)
    return Array.from({ length: Math.ceil(lastPageNumber / 20) }, (_, i) => i * 20 + 1);
}

const goPage = async (frame, pageNumber) => {
    await frame.evaluate((pageNumber) => {
        if (typeof goPage === 'function') {
            return goPage(pageNumber);
        }
    }, pageNumber)
}

const goPrevFromDetail = async (frame) => {
    await frame.evaluate(() => {
        if (typeof porBefSrnActSubmit === 'function') {
            return porBefSrnActSubmit();
        }
    })
}

const getRealEstateAuctionData = () => {
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
            rows.forEach((row) => {
                const thElements = row.querySelectorAll('th');
                const tdElements = row.querySelectorAll('td');

                thElements.forEach((th, index) => {
                    const key = cleanText(th.textContent);
                    if (key && tdElements[index]) {
                        const value = cleanText(tdElements[index].textContent);

                        // '목록 N 소재지'를 따로 처리
                        if (key.includes('목록') && key.includes('소재지')) {
                            locations.push({ [key]: value });
                        } else {
                            data[key] = value;
                        }
                    }
                });
            });
        }

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
        }
    }
    data['목록소재지'] = locations; // 목록 N 소재지를 별도로 추가
    return data;
}

let browser;
let frame;
let numberOfElementsInPage;

browser = await puppeteer.launch({
    args: undefined,
    defaultViewport: chromium.defaultViewport,
    executablePath: '/opt/homebrew/bin/chromium',
    headless: false,
});

frame = await openListPage(browser, '11')

let pageNumbers = await getPageNumbers(frame)

for (const pageNumber of pageNumbers) {
    console.log(`Go to ${pageNumber} page`)
    await goPage(frame, pageNumber)

    await delay(1500)

    // 한 페이지에 경매 물품 갯수 가져오기
    numberOfElementsInPage = (await frame.$$('#contents .Ltbl_list tbody tr')).length
    console.log(`Start to get ${numberOfElementsInPage} elements`)

    for (const idx of Array(numberOfElementsInPage).keys()) {
        const aTags = await frame.$$('#contents .Ltbl_list tbody tr');
        const aTag = await aTags[idx].$('.txtleft a');
        const address = await aTag.evaluate((el) => el.textContent.trim());

        console.log(`  Click the Address: ${address}`);
        await aTag.click();
        await frame.waitForSelector('#contents')
        await delay(1500)

        // 경매 정보 가져오기 
        const auctionData = await frame.evaluate(getRealEstateAuctionData);
        console.log(`  Get auction data: ${JSON.stringify(auctionData)}`)

        // 이전 페이지로 이동
        await goPrevFromDetail(frame)
        await delay(1500)
    }
}
