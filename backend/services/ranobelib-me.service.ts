import { Browser, Page, Protocol } from 'puppeteer'
import { Logger } from 'tslog'
import { autoInjectable } from 'tsyringe'
import { ERanobeUrls } from '../tools/enums/Services.enum'
import { DefaultService } from '../tools/interfaces/RanobeService.interface'
import { Chapter, IRanobe } from '../tools/interfaces/User.interface'
import {
  IReaderContainer,
  ISearchResponse
} from '../tools/service-responses/ranobelib-me.response'
import UtilsService from './utils.service'

export interface ILoginForm {
  email: string
  password: string
}

export type TSearchType = 'manga' | 'user'

@autoInjectable()
export default class RanobeLibMeService implements DefaultService {
  baseUrl = ERanobeUrls.RANOBELIBME
  logger = new Logger()
  private cookies = this.utils.getCookies('RANOBELIBME')

  constructor(private utils: UtilsService) {}

  async login(
    loginForm: ILoginForm
  ): Promise<[Protocol.Network.Cookie[], number, IRanobe[]]> {
    const [page, browser] = await this.utils.getPuppeeterStealth()

    await page.goto(this.baseUrl, {
      waitUntil: 'networkidle2'
    })

    await page.$('body')

    await page.click('#show-login-button')
    await page.waitForSelector('#sign-in-modal')
    await page.type('input[name=email]', loginForm.email)
    await page.type('input[name=password]', loginForm.password)
    await page.click('#sign-in-form .form__footer button[type=submit]')
    await page.waitForNavigation()

    await page.$('body')

    const userAvatar = await page.$<HTMLElement>('.header-right-menu__avatar')
    const identifier =
      (await userAvatar?.evaluate(img => {
        const src = img.getAttribute('src')?.split('/') || []
        return +(src[src.length - 2] || 0)
      })) || 0

    const cookies = (await page.cookies()).filter(
      cookie => cookie.name.charAt(0) !== '_'
    )

    const ranobeList = await this.getRanobeList(identifier)

    await browser.close()

    return [cookies, identifier, ranobeList]
  }

  async getRanobeList(
    userId: number,
    page?: Page,
    browser?: Browser
  ): Promise<IRanobe[]> {
    const ranobeListUrl = `${this.baseUrl}/user/${userId}?folder=all`

    if (!page || !browser) {
      ;[page, browser] = await this.utils.getPuppeeterStealth()
      await page.setCookie(...this.cookies)
    }

    await page.goto(ranobeListUrl, {
      waitUntil: 'networkidle2'
    })
    await page.$('body')

    const data = await page.evaluate(() => {
      const bookmarkItem = '.bookmark__list.paper .bookmark-item'
      const $covers = document.querySelectorAll(
        `${bookmarkItem} .bookmark-item__cover`
      )
      const $titleLinks = document.querySelectorAll(
        `${bookmarkItem} .bookmark-item__name`
      )

      const coverList = Array.from($covers).map(cover => {
        const attribute = cover.getAttribute('style')

        if (attribute) {
          const regex = /\((.*?)\)/gm
          const replaced = attribute.replace(/"/gm, '').match(regex)
          if (replaced) return replaced[0].replace('(', '').replace(')', '')
        }

        return attribute
      })

      return Array.from($titleLinks).map((title, index) => {
        return {
          title: title.firstChild?.textContent,
          href: title.getAttribute('href')?.split('?')[0].replace('/', ''),
          cover: coverList[index]
        } as IRanobe
      })
    })

    await browser.close()

    return data
  }

  async search(title: string, type: TSearchType): Promise<ISearchResponse> {
    const searchUrl = `${this.baseUrl}/search?type=${type}&q=${title}`

    const [page, browser] = await this.utils.getPuppeeterStealth()

    await page.goto(searchUrl, {
      waitUntil: 'networkidle2'
    })

    await page.content()

    const data = await page.evaluate(() => {
      return JSON.parse(
        document.querySelector('body')?.innerText || 'no content'
      )
    })

    await browser.close()

    return data
  }

  async getChapters(href: string): Promise<Chapter[]> {
    const url = `${this.baseUrl}/${href}?section=chapters`

    const [page, browser] = await this.utils.getPuppeeterStealth()

    await page.setViewport({
      width: 1920,
      height: 1080
    })
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 0
    })
    await page.content()

    const data = (await page.evaluate(async () => {
      const innerData = new Map<string, Chapter>()

      try {
        let currentScroll = 0
        let { scrollHeight } = document.body
        const scrollByY = window.innerHeight / 2

        while (currentScroll < scrollHeight) {
          const itemView = document.querySelectorAll(
            '.vue-recycle-scroller__item-view'
          )

          Array.from(itemView).forEach(el => {
            const mediaChapter = el.children[0]
            const mediaChapterBody = mediaChapter.children[1]
            const { children } = mediaChapterBody

            if (children.length) {
              const temp: Chapter = {
                title: '',
                href: '',
                author: '',
                date: ''
              }

              Array.from(children).forEach((el, index) => {
                switch (index) {
                  case 0: {
                    const linkTag = el.children[0]
                    temp.title = linkTag.textContent?.trim() || 'empty'
                    temp.href =
                      linkTag.getAttribute('href')?.replace('/', '') || 'empty'
                    break
                  }

                  case 1: {
                    temp.author = el.textContent?.trim() || 'empty'
                    break
                  }

                  case 2: {
                    temp.date = el.textContent?.trim() || 'empty'
                    break
                  }

                  default: {
                    break
                  }
                }
              })

              if (!innerData.has(temp.title)) {
                innerData.set(temp.title, temp)
              }
            }
          })

          window.scrollBy(0, scrollByY)
          currentScroll += scrollByY
          await new Promise(resolve => setTimeout(resolve, 1000))
          scrollHeight = document.body.scrollHeight
        }
      } catch (error) {
        this.logger.error(error)
      }

      return Array.from(innerData.values())
    })) as Chapter[]

    await browser.close()

    return data
  }

  async getChapterText(ranobeHrefList: string[]): Promise<IReaderContainer[]> {
    const readerContainer: IReaderContainer[] = []
    const [page, browser] = await this.utils.getPuppeeterStealth()

    for (const ranobeHref of ranobeHrefList) {
      try {
        const url = `${this.baseUrl}/${ranobeHref}`

        await page.goto(url, {
          waitUntil: 'networkidle2'
        })
        await page.content()

        const textContent = await page.evaluate(() => {
          const reader = document.querySelector(
            '.reader-container.container.container_center'
          )
          return reader?.innerHTML || ''
        })

        const [volume, chapter] = this.parseLink(ranobeHref)

        readerContainer.push({
          title: `Volume: ${volume}. Chapter: ${chapter}`,
          volume,
          chapter,
          textContent
        })
      } catch (error) {
        this.logger.error(error)
      }
    }

    await browser.close()

    return readerContainer
  }

  parseLink(link: string): string[] {
    if (link) {
      const parsed = link.split('/')
      const { length } = parsed
      const volume = parsed[length - 2].replace('v', '') || 'volume not found'
      const chapter = parsed[length - 1].replace('c', '') || 'chapter not found'
      return [volume, chapter]
    }
    return ['undefind', 'undefind']
  }

  getChaptersRange(ranobeHrefList: string[]): { start: string; end: string } {
    let [, start] = this.parseLink(ranobeHrefList[0])
    let [, end] = this.parseLink(ranobeHrefList[ranobeHrefList.length - 1])

    if (start > end) {
      const temp = start
      start = end
      end = temp
    }

    return { start, end }
  }
}
