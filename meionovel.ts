import { fetchApi } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { Plugin } from "@/types/plugin";
import { Cheerio, CheerioAPI, load as parseHTML } from "cheerio";
import { AnyNode } from "domhandler";

const SITE = "https://meionovels.com/";
const REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
};

const normalizePath = (value: string) => {
  try {
    if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
  } catch {
    return "";
  }
  return value.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
};
const novelPathOf = (href: string) => {
  const path = normalizePath(href);
  return /^novel\/[^/]+$/i.test(path) ? `${path}/` : undefined;
};
const chapterPathOf = (href: string) => {
  const path = normalizePath(href);
  return /^novel\/[^/]+\/.+/i.test(path) ? path : undefined;
};
const absoluteUrl = (value: string) => {
  try {
    return new URL(value, SITE).href;
  } catch {
    return undefined;
  }
};
const usableImage = (value?: string) =>
  !!value?.trim() && !/^data:|dflazy/i.test(value.trim());
const NAV_CHAPTER_RE =
  /^[►▶▸\s]*(mulai baca|baca terbaru|start reading|read first|read last|first chapter|latest chapter)/i;

class MeioNovelPlugin implements Plugin.PluginBase {
  id = "meionovel";
  name = "MeioNovel Custom";
  icon = "src/id/meionovel/icon.png";
  site = SITE;
  version = "3.0.8";
  imageRequestInit: Plugin.ImageRequestInit = { headers: { Referer: SITE } };

  private async fetchText(url: string, init?: Parameters<typeof fetchApi>[1]) {
    const response = await fetchApi(url, {
      ...init,
      headers: { ...REQUEST_HEADERS, ...init?.headers },
    });
    if (!response.ok) return "";
    return response.text();
  }

  private async getHtml(url: string) {
    const response = await fetchApi(url, { headers: REQUEST_HEADERS });
    if (!response.ok) {
      throw new Error(`MeioNovel request failed (${response.status}): ${url}`);
    }
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
    if (/bot verification|captcha|verify you are human|just a moment/i.test(title)) {
      throw new Error("MeioNovel blocked the request; open the source in WebView first.");
    }
    return { html, $: parseHTML(html) };
  }

  private getCover(scope: Cheerio<AnyNode>) {
    const image = scope.find("img").first();
    const candidates = [
      image.attr("data-lazy-src"), image.attr("data-src"), image.attr("data-cfsrc"),
      image.attr("data-lazy-srcset")?.split(/[ ,]/)[0], image.attr("data-srcset")?.split(/[ ,]/)[0],
      image.attr("srcset")?.split(/[ ,]/)[0], image.attr("src"),
    ];
    const value = candidates.find(usableImage);
    return value ? absoluteUrl(value) : undefined;
  }

  private parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const results = new Map<string, Plugin.NovelItem>();
    const cards = $(".c-tabs-item__content, .page-item-detail, .novel-item");
    const links = (cards.length ? cards : $("body")).find("a[href]");
    links.each((_, element) => {
      const link = $(element);
      const path = novelPathOf(link.attr("href") || "");
      if (!path) return;
      const card = link.closest(".page-item-detail, .c-tabs-item__content, .novel-item, article");
      const name = card.find(".post-title, h3, h2").first().text().trim() ||
        link.attr("title")?.trim() || link.text().trim() ||
        card.find("img").first().attr("alt")?.trim() || "";
      if (!name) return;
      const item = results.get(path);
      if (item) {
        if (!item.cover) item.cover = this.getCover(card);
      } else {
        results.set(path, { name, path, cover: this.getCover(card) });
      }
    });
    return [...results.values()];
  }

  private parseChapters(html: string, novelPath: string): Plugin.ChapterItem[] {
    const $ = parseHTML(html);
    const prefix = `${normalizePath(novelPath)}/`;
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const add = (link: Cheerio<AnyNode>, releaseTime = "") => {
      const path = chapterPathOf(link.attr("href") || "");
      const name = link.text().replace(/\s+/g, " ").trim();
      if (!path || !path.startsWith(prefix) || !name || NAV_CHAPTER_RE.test(name) || seen.has(path)) return;
      if (/\/(?:ajax|feed|comments?|embed|amp|page)(?:\/|$)/i.test(path.slice(prefix.length))) return;
      seen.add(path);
      chapters.push({ name, path, releaseTime: releaseTime || undefined });
    };
    $(".wp-manga-chapter, .chapter-item").each((_, element) => {
      const row = $(element);
      add(row.find("a[href]").first(), row.find(".chapter-release-date").text().trim());
    });
    if (!chapters.length) $("a[href]").each((_, element) => add($(element)));
    return chapters.reverse().map((chapter, index) => ({ ...chapter, chapterNumber: index + 1 }));
  }

  private async chapterListHtml(endpoint: string, novelUrl: string) {
    const request = async (method: "POST" | "GET", url = endpoint) => {
      try {
        const response = await fetchApi(url, {
          method,
          headers: { ...REQUEST_HEADERS, Referer: novelUrl, ...(method === "POST" ? { "X-Requested-With": "XMLHttpRequest" } : {}) },
          ...(method === "POST" ? { referrer: novelUrl } : {}),
        });
        return response.ok ? await response.text() : "";
      } catch {
        return "";
      }
    };
    let html = await request("POST");
    if (!html || html.trim() === "0") html = await request("GET");
    if (!html || html.trim() === "0") return "";

    const $ = parseHTML(html);
    const pageLinks = $(".pagination a[data-page]");
    const pageNumbers = pageLinks.map((_, el) => Number.parseInt($(el).attr("data-page") || "", 10))
      .get().filter((n) => Number.isFinite(n) && n > 1);
    const maxPage = Math.min(100, Math.max(1, ...pageNumbers));
    const lastHref = pageLinks.last().attr("href") || "";
    const queryAt = lastHref.indexOf("?");
    if (maxPage <= 1 || queryAt < 0) return html;
    const template = lastHref.slice(queryAt).replace(/\d+$/, "");
    const urls = Array.from({ length: maxPage - 1 }, (_, i) => `${endpoint}${template}${i + 2}`);
    for (let i = 0; i < urls.length; i += 6) {
      const pages = await Promise.all(urls.slice(i, i + 6).map((url) => request("POST", url)));
      html += pages.filter((page) => page && page.trim() !== "0").join("");
    }
    return html;
  }

  async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<typeof this.filters>): Promise<Plugin.NovelItem[]> {
    const order = options?.showLatestNovels ? "latest" : "views";
    const html = await this.fetchText(`${SITE}novel/page/${pageNo}/?m_orderby=${order}`);
    return html ? this.parseNovels(parseHTML(html)) : [];
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
    const html = await this.fetchText(`${SITE}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`);
    return html ? this.parseNovels(parseHTML(html)) : [];
  }

  private findPostId($: CheerioAPI) {
    const bodyClass = $("body").attr("class") || "";
    return $(".rating-post-id").attr("value") || $("#manga-chapters-holder").attr("data-id") ||
      $("[data-post]").first().attr("data-post") || bodyClass.match(/(?:^|\s)postid-(\d+)/)?.[1] ||
      ($('link[rel="shortlink"]').attr("href") || "").match(/[?&]p=(\d+)/)?.[1] || "";
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const cleanPath = normalizePath(novelPath);
    const novelUrl = `${SITE}${cleanPath}/`;
    const [{ html: pageHtml, $ }, chapterHtml] = await Promise.all([
      this.getHtml(novelUrl), this.chapterListHtml(`${novelUrl}ajax/chapters/`, novelUrl),
    ]);
    $(".manga-title-badges, #manga-title span").remove();
    const name = $(".post-title h1").first().text().trim() || $("#manga-title h1").first().text().trim() ||
      $(".manga-title").first().text().trim() || $("h1.entry-title").first().text().trim() ||
      $("h1").first().text().trim() || $('meta[property="og:title"]').attr("content")?.trim() || "";
    if (!name) throw new Error(`MeioNovel novel page had no title: ${novelUrl}`);

    let chapters = chapterHtml ? this.parseChapters(chapterHtml, cleanPath) : [];
    // Some installations reject POST with 405 but serve the list on GET; retry GET before legacy AJAX.
    if (chapters.length <= 1) {
      const getHtml = await this.fetchText(`${novelUrl}ajax/chapters/`);
      const getChapters = getHtml ? this.parseChapters(getHtml, cleanPath) : [];
      if (getChapters.length > chapters.length) chapters = getChapters;
    }
    if (!chapters.length) {
      const postId = this.findPostId($);
      if (postId) {
        const form = `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`;
        const oldHtml = await this.fetchText(`${SITE}wp-admin/admin-ajax.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: novelUrl },
          body: form,
        });
        if (oldHtml && oldHtml.trim() !== "0") chapters = this.parseChapters(oldHtml, cleanPath);
      }
    }
    if (!chapters.length) chapters = this.parseChapters(pageHtml, cleanPath);

    const detail = (pattern: RegExp) => $(".post-content_item").filter((_, el) => pattern.test($(el).find("h5").text()));
    const coverUrl = this.getCover($(".summary_image").first()) || $('meta[property="og:image"]').attr("content");
    const summary = $(".summary__content, .manga-summary, .description-summary").first().text().trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() || $('meta[name="description"]').attr("content")?.trim();
    const statusText = detail(/status/i).text().trim();
    return {
      path: novelPath, name,
      cover: coverUrl && usableImage(coverUrl) ? absoluteUrl(coverUrl) : undefined,
      author: detail(/author/i).find(".summary-content, .summary_content").text().trim() || undefined,
      genres: detail(/genre|kategori|tag/i).find("a").map((_, el) => $(el).text().trim()).get().filter(Boolean).join(", ") || undefined,
      status: /ongoing|on-going|berjalan/i.test(statusText) ? NovelStatus.Ongoing :
        /completed|complete|end|tamat|selesai/i.test(statusText) ? NovelStatus.Completed : NovelStatus.Unknown,
      summary, chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const cleanPath = normalizePath(chapterPath);
    const { $, html: rawHtml } = await this.getHtml(`${SITE}${cleanPath}/`);
    $("script, style, noscript, iframe, .ads, .ad, .adsbygoogle, .chapter-nav, .nav-links, .wp-manga-nav, nav, header, footer, form, .comments, #comments").remove();
    const selectors = [".reading-content", "#chapter-content", ".chapter-content", ".chapter-body", "#chr-content", ".text-left", ".text-right", ".entry-content", ".c-blog-post > div > div:nth-child(2)"];
    for (const selector of selectors) {
      const content = $(selector).first();
      const text = content.text().replace(/\s+/g, " ").trim();
      if (!content.length || text.length < 30) continue;
      content.find("p").each((_, p) => {
        const paragraph = $(p);
        if (!paragraph.find("br").length) return;
        const lines = (paragraph.html() || "").split(/<br\s*\/?>/i)
          .map((line) => line.replace(/\uFEFF/g, "").trim())
          .filter((line) => line.replace(/&nbsp;|\u00a0/g, "").trim());
        paragraph.replaceWith(lines.map((line) => `<p>${line}</p>`).join(""));
      });
      return content.html()?.trim() || "";
    }
    const title = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 80) || "";
    throw new Error(`MeioNovel chapter content not found: ${cleanPath} | title=${title}`);
  }

  resolveUrl = (path: string) => /^https?:\/\//i.test(path) ? path : `${SITE}${normalizePath(path)}/`;
}

export default new MeioNovelPlugin();
