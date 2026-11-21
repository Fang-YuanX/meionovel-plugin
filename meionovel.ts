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

const normalizePath = (path: string) =>
  path
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/, 1)[0]
    .replace(/^\/+|\/+$/g, "");

const getNovelPath = (href: string) => {
  const path = normalizePath(href);
  const match = path.match(/^novel\/([^/]+)$/i);
  return match ? `novel/${match[1]}/` : undefined;
};

const getChapterPath = (href: string) => {
  const path = normalizePath(href);
  return path.startsWith("novel/") ? path : undefined;
};

const isUsableUrl = (url?: string): url is string =>
  !!url && url.trim() !== "" && !/^data:/i.test(url.trim());

const absoluteUrl = (url: string) => {
  const value = url.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${SITE}${value.slice(1)}`;
  return `${SITE}${value}`;
};

const firstFromSrcset = (srcset?: string) =>
  srcset?.split(",")[0]?.trim().split(/\s+/)[0];

const getCover = (element: Cheerio<AnyNode>) => {
  const image = element.find("img").first();
  const found = [
    image.attr("data-lazy-src"),
    image.attr("data-src"),
    image.attr("data-cfsrc"),
    firstFromSrcset(image.attr("data-lazy-srcset")),
    firstFromSrcset(image.attr("data-srcset")),
    firstFromSrcset(image.attr("srcset")),
    image.attr("src"),
  ].find(isUsableUrl);
  return found ? absoluteUrl(found) : undefined;
};

const CARD_SELECTOR =
  ".page-item-detail, .c-tabs-item__content, .novel-item, article";

const NAV_CHAPTER_RE =
  /^[►▶▸\s]*(mulai baca|baca terbaru|start reading|read first|read last|first chapter|latest chapter)/i;

const chapterNumberOf = (rest: string): number | undefined => {
  const last = rest.split("/").pop() || "";
  const match = last.match(/(\d+(?:\.\d+)?)(?!.*\d)/);
  return match ? Number(match[1]) : undefined;
};

const prettyChapterName = (rest: string) =>
  rest
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    )
    .join(" ")
    .replace(/\bMtl\b/g, "MTL");

const labelOf = ($: CheerioAPI, element: AnyNode) => {
  const el = $(element);
  const tag = String(el.prop("tagName") || "?").toLowerCase();
  const cls = (el.attr("class") || "").trim().split(/\s+/)[0];
  const id = el.attr("id");
  return `${tag}${cls ? "." + cls : ""}${id ? "#" + id : ""}`;
};

const PLACEHOLDER_RE = /Memuat isi chapter|Memuat daftar isi|Muat ulang halaman/i;

const rankContainers = ($: CheerioAPI) => {
  const candidates: { el: Cheerio<AnyNode>; score: number; label: string }[] =
    [];
  $("article, main, section, div, td").each((_, element) => {
    const el = $(element);
    let score = 0;
    el.children("p").each((__, p) => {
      score += $(p).text().trim().length;
    });
    if (el.children("br").length > 3) {
      score += el.clone().children().remove().end().text().trim().length;
    }
    if (score > 0) {
      candidates.push({ el, score, label: `${labelOf($, element)}:${score}` });
    }
  });
  return candidates.sort((a, b) => b.score - a.score);
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

class MeioNovelCustomPlugin implements Plugin.PluginBase {
  id = "meionovel";
  name = "MeioNovel Custom";
  icon = "src/id/meionovel/icon.png";
  site = SITE;
  version = "3.0.8";
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: { Referer: SITE },
  };

  private async getHtml(
    url: string,
    init?: Parameters<typeof fetchApi>[1],
  ): Promise<{ html: string; $: CheerioAPI }> {
    const response = await fetchApi(url, {
      ...init,
      headers: { ...REQUEST_HEADERS, ...init?.headers },
    });
    if (!response.ok) {
      throw new Error(`MeioNovel request failed (${response.status}): ${url}`);
    }

    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
    if (
      /just a moment|bot verification|captcha|verify you are human/i.test(title)
    ) {
      throw new Error(
        "MeioNovel blocked the request; open the source in WebView first.",
      );
    }

    return { html, $: parseHTML(html) };
  }

  private parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels = new Map<string, Plugin.NovelItem>();

    const findScope = (link: Cheerio<AnyNode>): Cheerio<AnyNode> => {
      const card = link.closest(CARD_SELECTOR);
      if (card.length) return card;
      let node = link;
      for (let i = 0; i < 2; i++) {
        node = node.parent();
        if (!node.length) break;
        const paths = new Set<string>();
        node.find("a[href]").each((_, a) => {
          const p = getNovelPath($(a).attr("href") || "");
          if (p) paths.add(p);
        });
        if (paths.size === 1 && node.find("img").length) return node;
      }
      return link;
    };

    const resultSelector = [
      ".c-tabs-item__content",
      ".page-item-detail",
      ".novel-item",
    ].find((selector) => $(selector).length > 0);
    const anchors = resultSelector
      ? $(resultSelector).find("a[href]")
      : $("a[href]");

    anchors.each((_, element) => {
      const link = $(element);
      const path = getNovelPath(link.attr("href") || "");
      if (!path) return;

      const scope = findScope(link);
      const inCard = scope.is(CARD_SELECTOR);
      const name =
        (inCard
          ? scope.find(".post-title, h3, h2").first().text().trim()
          : "") ||
        link.attr("title")?.trim() ||
        link.text().trim() ||
        scope.find("img").first().attr("alt")?.trim() ||
        "";
      const cover = getCover(scope);

      const existing = novels.get(path);
      if (existing) {
        if (!existing.cover && cover) existing.cover = cover;
        if (!existing.name && name) existing.name = name;
        return;
      }
      if (!name) return;
      novels.set(path, { name, path, cover });
    });

    return Array.from(novels.values());
  }

  private seenPaths = new Map<string, Set<string>>();

  private dedupe(
    key: string,
    pageNo: number,
    novels: Plugin.NovelItem[],
  ): Plugin.NovelItem[] {
    if (pageNo <= 1 || !this.seenPaths.has(key)) {
      this.seenPaths.set(key, new Set());
    }
    const seen = this.seenPaths.get(key) as Set<string>;
    return novels.filter((novel) => {
      if (seen.has(novel.path)) return false;
      seen.add(novel.path);
      return true;
    });
  }

  private parseChapters(html: string, novelPath: string): Plugin.ChapterItem[] {
    const $ = parseHTML(html);
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    const push = (link: Cheerio<AnyNode>, releaseTime?: string) => {
      const path = getChapterPath(link.attr("href") || "");
      const name = link.text().replace(/\s+/g, " ").trim();
      if (!path || !name || seen.has(path)) return;
      if (NAV_CHAPTER_RE.test(name)) return;
      seen.add(path);
      chapters.push({ name, path, releaseTime: releaseTime || undefined });
    };

    $(".wp-manga-chapter, .chapter-item").each((_, element) => {
      const chapter = $(element);
      push(
        chapter.find("a").first(),
        chapter.find(".chapter-release-date").text().trim(),
      );
    });

    if (!chapters.length) {
      const prefix = `${novelPath}/`;
      $("a[href]").each((_, element) => {
        const link = $(element);
        const path = getChapterPath(link.attr("href") || "");
        if (!path || !path.startsWith(prefix)) return;
        push(link);
      });
    }

    return chapters.reverse().map((chapter, index) => ({
      ...chapter,
      chapterNumber: index + 1,
    }));
  }

  private async postForm(
    url: string,
    body: string,
    referer: string,
  ): Promise<string> {
    try {
      const response = await fetchApi(url, {
        method: "POST",
        headers: {
          ...REQUEST_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: referer,
        },
        body,
      });
      return response.ok ? await response.text() : "";
    } catch (error) {
      return "";
    }
  }

  private async getChapterHtml(
    endpoint: string,
    novelUrl: string,
  ): Promise<string> {
    const fetchPage = async (url: string) =>
      fetchApi(url, {
        method: "POST",
        headers: REQUEST_HEADERS,
        referrer: novelUrl,
      })
        .then((response) => (response.ok ? response.text() : ""))
        .catch(() => "");

    let html = await fetchPage(endpoint);
    if (!html || html === "0") return "";

    const $ = parseHTML(html);
    const pageLinks = $(".pagination a[data-page]");
    const pageNumbers = pageLinks
      .map((_, element) =>
        Number.parseInt($(element).attr("data-page") || "", 10),
      )
      .get()
      .filter((page) => Number.isFinite(page) && page > 1);
    const maxPage = Math.max(1, ...pageNumbers);
    const lastHref = pageLinks.last().attr("href") || "";
    const queryIndex = lastHref.indexOf("?");
    if (maxPage === 1 || queryIndex === -1) return html;

    const queryTemplate = lastHref.slice(queryIndex).replace(/\d+$/, "");
    const pageUrls = Array.from(
      { length: maxPage - 1 },
      (_, index) => `${endpoint}${queryTemplate}${index + 2}`,
    );
    for (let index = 0; index < pageUrls.length; index += 6) {
      const batch = pageUrls.slice(index, index + 6);
      const pages = await Promise.all(batch.map(fetchPage));
      html += pages.filter((page) => page && page !== "0").join("");
    }

    return html;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const order = options?.showLatestNovels ? "latest" : "views";
    try {
      const { $ } = await this.getHtml(
        `${SITE}novel/page/${pageNo}/?m_orderby=${order}`,
      );
      return this.dedupe(`popular:${order}`, pageNo, this.parseNovels($));
    } catch (error) {
      if (pageNo > 1 && /\(404\)/.test(String((error as Error)?.message))) {
        return [];
      }
      throw error;
    }
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = encodeURIComponent(searchTerm);
    try {
      const { $ } = await this.getHtml(
        `${SITE}page/${pageNo}/?s=${query}&post_type=wp-manga`,
      );
      return this.dedupe(`search:${query}`, pageNo, this.parseNovels($));
    } catch (error) {
      if (pageNo > 1 && /\(404\)/.test(String((error as Error)?.message))) {
        return [];
      }
      throw error;
    }
  }

  private discoverChapters(
    html: string,
    cleanPath: string,
    known: Plugin.ChapterItem[],
  ): Plugin.ChapterItem[] {
    const slug = cleanPath.replace(/^novel\//, "").replace(/\/+$/, "");
    const base = `novel/${slug}/`;
    const names = new Map<string, string>();
    const order: string[] = [];
    const add = (path: string, name?: string) => {
      const clean = path.replace(/\/+$/, "");
      const rest = clean.slice(base.length);
      if (!clean.startsWith(base) || !rest) return;
      if (/^(ajax|feed|comments?|embed|amp|page)(\/|$)/i.test(rest)) return;
      if (name && NAV_CHAPTER_RE.test(name)) name = undefined;
      if (!names.has(clean)) {
        names.set(clean, name || prettyChapterName(rest));
        order.push(clean);
      } else if (name && /^(MTL )?Chapter/i.test(names.get(clean) || "")) {
        names.set(clean, name);
      }
    };

    known.forEach((chapter) => add(chapter.path, chapter.name));

    const $ = parseHTML(html);
    $("a[href]").each((_, element) => {
      const link = $(element);
      const path = getChapterPath(link.attr("href") || "");
      if (path) add(path, link.text().replace(/\s+/g, " ").trim());
    });

    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      "novel(?:\\\\?/)" +
        escaped +
        "((?:(?:\\\\?/)[A-Za-z0-9_\\-]+)+)",
      "g",
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      add(`${base}${match[1].replace(/\\?\//g, "/").replace(/^\/+/, "")}`);
    }

    const items = order.map((path) => ({
      path,
      name: names.get(path) as string,
      num: chapterNumberOf(path.slice(base.length)),
    }));
    const numbered = items.filter((item) => item.num !== undefined).length;
    if (items.length && numbered / items.length >= 0.8) {
      items.sort(
        (a, b) =>
          (a.num as number) - (b.num as number) ||
          a.path.localeCompare(b.path),
      );
    }
    return items.map((item, index) => ({
      name: item.name,
      path: item.path,
      chapterNumber: index + 1,
    }));
  }

  private async getText(url: string): Promise<string> {
    try {
      const response = await fetchApi(url, { headers: REQUEST_HEADERS });
      return response.ok ? await response.text() : "";
    } catch (error) {
      return "";
    }
  }

  private findPostId($: CheerioAPI): string {
    const bodyClass = $("body").attr("class") || "";
    return (
      $(".rating-post-id").attr("value") ||
      $("#manga-chapters-holder").attr("data-id") ||
      $("[data-post]").first().attr("data-post") ||
      bodyClass.match(/(?:^|\s)postid-(\d+)/)?.[1] ||
      ($('link[rel="shortlink"]').attr("href") || "").match(/[?&]p=(\d+)/)?.[1] ||
      ($("article[id^='post-']").first().attr("id") || "").replace("post-", "") ||
      ""
    );
  }

  private async probe(url: string, body: string, referer: string) {
    try {
      const response = await fetchApi(url, {
        method: "POST",
        headers: {
          ...REQUEST_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: referer,
        },
        body,
      });
      const text = await response.text();
      return `${response.status}/${text.length}/${text
        .replace(/\s+/g, " ")
        .slice(0, 140)}`;
    } catch (error) {
      return `ERR ${String(error).slice(0, 80)}`;
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const cleanPath = normalizePath(novelPath);
    const novelUrl = `${SITE}${cleanPath}/`;
    const [page, chapterHtml] = await Promise.all([
      this.getHtml(novelUrl),
      this.getChapterHtml(`${novelUrl}ajax/chapters/`, novelUrl),
    ]);

    const { $ } = page;
    $(".manga-title-badges, #manga-title span").remove();

    const name =
      $(".post-title h1").first().text().trim() ||
      $("#manga-title h1").first().text().trim() ||
      $(".manga-title").first().text().trim() ||
      $("h1.entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      ($('meta[property="og:title"]').attr("content") || "").trim();
    if (!name) {
      throw new Error(`MeioNovel novel page had no title: ${novelUrl}`);
    }

    // 1) endpoint baru, 2) admin-ajax lama, 3) daftar chapter di HTML halaman
    const novelId = this.findPostId($);
    let chapters = chapterHtml ? this.parseChapters(chapterHtml, cleanPath) : [];
    if (!chapters.length && novelId) {
      const oldHtml = await this.postForm(
        `${SITE}wp-admin/admin-ajax.php`,
        `action=manga_get_chapters&manga=${encodeURIComponent(novelId)}`,
        novelUrl,
      );
      if (oldHtml && oldHtml !== "0") {
        chapters = this.parseChapters(oldHtml, cleanPath);
      }
    }
    if (!chapters.length) {
      chapters = this.parseChapters(page.html, cleanPath);
    }
    if (chapters.length <= 1) {
      const getAjax = await this.getText(`${novelUrl}ajax/chapters/`);
      const fromGet = getAjax ? this.parseChapters(getAjax, cleanPath) : [];
      const discovered = this.discoverChapters(
        `${page.html}\n${getAjax}`,
        cleanPath,
        fromGet.length > chapters.length ? fromGet : chapters,
      );
      if (discovered.length > chapters.length) chapters = discovered;
    }

    const detail = (pattern: RegExp) =>
      $(".post-content_item")
        .filter((_, element) => pattern.test($(element).find("h5").text()))
        .find(".summary-content, .summary_content");

    const statusText = detail(/status/i).text().trim();

    const cover =
      getCover($(".summary_image").first()) ||
      ($('meta[property="og:image"]').attr("content") &&
      isUsableUrl($('meta[property="og:image"]').attr("content"))
        ? absoluteUrl($('meta[property="og:image"]').attr("content") as string)
        : undefined);

    const metaDescription = (
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const readText = (el: Cheerio<AnyNode>) => {
      const paragraphs = el
        .find("p")
        .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean);
      return (paragraphs.length ? paragraphs.join("\n\n") : el.text())
        .replace(/[ \t]+/g, " ")
        .trim();
    };
    const synopsisEl = $(
      ".summary__content, .synopsis, #synopsis, .sinopsis, [itemprop='description'], .manga-summary, .description-summary",
    )
      .filter((_, el) => $(el).text().trim().length > 60)
      .first();
    let summary = synopsisEl.length ? readText(synopsisEl) : "";
    if (summary.length < metaDescription.length) {
      // og:description sering terpotong; cari blok paragraf yang lebih lengkap
      for (const candidate of rankContainers($).slice(0, 6)) {
        const text = readText(candidate.el);
        if (
          text.length > Math.max(metaDescription.length, summary.length) &&
          text.length < 4000 &&
          !PLACEHOLDER_RE.test(text)
        ) {
          summary = text;
          break;
        }
      }
    }
    if (summary.length < metaDescription.length) summary = metaDescription;
    const finalSummary = summary || undefined;

    return {
      path: novelPath,
      name,
      cover,
      author: detail(/author/i).text().trim() || undefined,
      genres:
        detail(/genre|kategori|tag/i)
          .find("a")
          .map((_, element) => $(element).text().trim())
          .get()
          .filter(Boolean)
          .join(", ") || undefined,
      status: /ongoing|on-going|berjalan/i.test(statusText)
        ? NovelStatus.Ongoing
        : /completed|complete|end|tamat|selesai/i.test(statusText)
          ? NovelStatus.Completed
          : NovelStatus.Unknown,
      summary: finalSummary,
      chapters,
    };
  }

  private extractEmbedded(rawHtml: string): string | undefined {
    const scripts = rawHtml.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
    let best = "";
    for (const script of scripts) {
      const re = /"((?:[^"\\]|\\.){600,})"/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(script))) {
        let value = "";
        try {
          value = JSON.parse(`"${match[1]}"`);
        } catch (error) {
          continue;
        }
        if (/^(https?:|data:)/i.test(value)) continue;
        if (!/\s/.test(value.slice(0, 200))) continue;
        if (PLACEHOLDER_RE.test(value)) continue;
        if (value.length > best.length) best = value;
      }
    }
    if (best.length < 600) return undefined;
    if (/<p[\s>]/i.test(best)) return best;
    return best
      .split(/\r?\n\s*\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p>${escapeHtml(block).replace(/\r?\n/g, "<br>")}</p>`)
      .join("");
  }

  private async describeDynamic(rawHtml: string): Promise<string> {
    const $ = parseHTML(rawHtml);
    const parts: string[] = [];
    const attrs = (el: Cheerio<AnyNode>) =>
      Object.entries(el.attr() || {})
        .filter(([key]) => key !== "style")
        .map(([key, value]) => `${key}=${String(value).slice(0, 70)}`)
        .join(";");

    const holder = $("*")
      .filter(
        (_, el) =>
          $(el).children().length === 0 && PLACEHOLDER_RE.test($(el).text()),
      )
      .first();
    if (holder.length) {
      let node = holder;
      for (let i = 0; i < 3 && node.length; i++) {
        parts.push(`h${i}=${labelOf($, node.get(0) as AnyNode)}[${attrs(node)}]`);
        node = node.parent();
      }
    }
    parts.push(`body[${attrs($("body")).slice(0, 120)}]`);

    const metas = $("meta[name], meta[property]")
      .map((_, el) => $(el).attr("name") || $(el).attr("property") || "")
      .get()
      .filter((name) => !/viewport|robots|description|theme|generator|^og:|^twitter:/i.test(name))
      .slice(0, 8);
    parts.push(`meta=${metas.join(",")}`);

    const skip = /jquery|cloudflare|google|gstatic|adsbygoogle|wp-includes|gtag/i;
    const srcs = $("script[src]")
      .map((_, el) => $(el).attr("src") || "")
      .get()
      .filter((src) => !skip.test(src));
    parts.push(
      `js=${srcs
        .map((src) => src.replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(-40))
        .slice(0, 6)
        .join(",")}`,
    );

    let bundle = $("script:not([src])")
      .map((_, el) => $(el).html() || "")
      .get()
      .join("\n");
    const sameOrigin = srcs
      .filter((src) => /^(https?:)?\/\/(www\.)?meionovels\.com|^\//.test(src))
      .slice(0, 3);
    for (const src of sameOrigin) {
      bundle += `\n${await this.getText(absoluteUrl(src))}`;
    }

    const grep = (re: RegExp, count: number, group = 0) => {
      const out: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = re.exec(bundle)) && out.length < count) {
        const value = (match[group] || match[0]).slice(0, 90);
        if (!out.includes(value)) out.push(value);
      }
      return out.join(",");
    };
    parts.push(`wpjson=${grep(/wp-json\/[A-Za-z0-9_\-\/.]+/g, 6)}`);
    parts.push(`api=${grep(/["'`](\/?api\/[A-Za-z0-9_\-\/.{}$]+)/g, 5, 1)}`);
    parts.push(`action=${grep(/action\s*[:=]\s*["']([A-Za-z0-9_\-]+)["']/g, 6, 1)}`);
    parts.push(`fetch=${grep(/fetch\(([^)]{0,90})\)?/g, 4, 1)}`);
    return parts.join(" | ").slice(0, 1500);
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const cleanPath = normalizePath(chapterPath);
    const { $, html: rawHtml } = await this.getHtml(`${SITE}${cleanPath}/`);
    $(
      "script, style, noscript, iframe, .ads, .ad, .adsbygoogle, .chapter-nav, .nav-links, .wp-manga-nav, nav, header, footer, form, .comments, #comments",
    ).remove();

    const finish = (content: Cheerio<AnyNode>) => {
      content.find("p").each((_, element) => {
        const paragraph = $(element);
        if (!paragraph.find("br").length) return;
        const lines = (paragraph.html() || "")
          .split(/<br\s*\/?>/i)
          .map((line) => line.replace(/\uFEFF/g, "").trim())
          .filter((line) => line.replace(/&nbsp;|\u00a0/g, "").trim());
        paragraph.replaceWith(lines.map((line) => `<p>${line}</p>`).join(""));
      });
      return content.html()?.trim();
    };

    const usable = (content: Cheerio<AnyNode>, min: number) => {
      const text = content.text().replace(/\s+/g, " ").trim();
      return text.length >= min && !PLACEHOLDER_RE.test(text);
    };

    // 1) selector yang umum dipakai tema novel
    for (const selector of [
      ".reading-content",
      "#chapter-content",
      ".chapter-content",
      ".chapter-body",
      "#chr-content",
      ".entry-content",
      ".text-left",
      ".text-right",
      "article",
    ]) {
      const content = $(selector).first();
      if (!usable(content, 200)) continue;
      const html = finish(content);
      if (html) return html;
    }

    // 2) deteksi otomatis: container dengan teks paragraf terbanyak
    const candidates = rankContainers($);
    for (const candidate of candidates.slice(0, 8)) {
      if (candidate.score < 150) break;
      if (!usable(candidate.el, 150)) continue;
      const html = finish(candidate.el);
      if (html) return html;
    }

    // 3) isi chapter ditanam sebagai JSON di dalam script
    const embedded = this.extractEmbedded(rawHtml);
    if (embedded) return embedded;

    const dynamic = await this.describeDynamic(rawHtml);
    throw new Error(
      `MeioNovel chapter content is loaded by JS: ${cleanPath} | DYN: ${dynamic}`,
    );
  }

  resolveUrl = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${SITE}${normalizePath(path)}/`;
}

export default new MeioNovelCustomPlugin();
