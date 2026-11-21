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

const apiHeaders = (referer: string): Record<string, string> => ({
  Accept: "application/json, text/plain, */*",
  "X-Requested-With": "XMLHttpRequest",
  Referer: referer,
});

const jsonChaptersOf = (json: unknown, base: string, novelSlug: string) => {
  const out: { path: string; name?: string }[] = [];
  const nameKeys = ["title", "name", "chapter_title", "chapter_name", "label"];
  const pathKeys = [
    "url",
    "href",
    "link",
    "path",
    "permalink",
    "slug",
    "chapter_slug",
  ];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    let path: string | undefined;
    for (const key of pathKeys) {
      const value = obj[key];
      if (typeof value !== "string" || !value) continue;
      const normalized = normalizePath(value);
      if (normalized.startsWith(base)) {
        path = normalized;
        break;
      }
      if (
        key.includes("slug") &&
        value !== novelSlug &&
        /^[A-Za-z0-9_\-]+$/.test(value)
      ) {
        path = `${base}${value}`;
        break;
      }
    }
    if (path) {
      const nameKey = nameKeys.find((k) => typeof obj[k] === "string" && obj[k]);
      out.push({ path, name: nameKey ? String(obj[nameKey]) : undefined });
    }
    Object.values(obj).forEach(walk);
  };
  walk(json);
  return out;
};

const contentFromJson = (json: unknown): string => {
  let bestString = "";
  let bestArray = "";
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      if (node.length > bestString.length) bestString = node;
    } else if (Array.isArray(node)) {
      if (node.length > 3 && node.every((item) => typeof item === "string")) {
        const joined = (node as string[]).join("\n\n");
        if (joined.length > bestArray.length) bestArray = joined;
      }
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };
  walk(json);
  return bestArray.length > bestString.length ? bestArray : bestString;
};

const contentToHtml = (content: string) =>
  /<p[\s>]/i.test(content)
    ? content
    : content
        .split(/\r?\n\s*\r?\n|\r?\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => `<p>${escapeHtml(block)}</p>`)
        .join("");

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const b64decode = (input: string): Uint8Array => {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
};

const utf8Decode = (bytes: Uint8Array): string => {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xe0 && b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f),
      );
    } else if (b >= 0xf0 && b < 0xf8) {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      const v = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else {
      out += "\ufffd";
    }
  }
  return out;
};

// Salinan logika go() di app.js situs: {k: kunci base64, p: [[offset, base64], ...]}
const decodePayload = (data: { k: string; p: [number, string][] }): string => {
  const key = b64decode(String(data.k));
  const parts = data.p
    .slice()
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([offset, chunk]) => ({ offset: Number(offset), bytes: b64decode(chunk) }));
  let total = 0;
  parts.forEach((part) => (total += part.bytes.length));
  const all = new Uint8Array(total);
  let position = 0;
  parts.forEach((part) => {
    for (let o = 0; o < part.bytes.length; o++) {
      all[position++] = key.length
        ? part.bytes[o] ^ key[(o + part.offset) % key.length]
        : part.bytes[o];
    }
  });
  return utf8Decode(all);
};

const decodeJs = (value: string) =>
  value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

// Baca konfigurasi gaya {key: "nilai", key2: 123} dari atribut x-data / script
const readConfig = (source: string, keys: string[]): Record<string, string> => {
  const text = source
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0026/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
  const out: Record<string, string> = {};
  keys.forEach((key) => {
    const re = new RegExp(
      "(?:^|[^A-Za-z0-9_$])[\"']?" +
        key +
        "[\"']?\\s*:\\s*(?:\"((?:[^\"\\\\]|\\\\.)*)\"|'((?:[^'\\\\]|\\\\.)*)'|(-?\\d+(?:\\.\\d+)?)|(null|true|false))",
    );
    const match = re.exec(text);
    if (!match) return;
    if (match[1] !== undefined) out[key] = decodeJs(match[1]);
    else if (match[2] !== undefined) out[key] = decodeJs(match[2]);
    else if (match[3] !== undefined) out[key] = match[3];
  });
  return out;
};

const asIdValue = (value: string | undefined): string | number | undefined =>
  value === undefined ? undefined : /^-?\d+$/.test(value) ? Number(value) : value;

class MeioNovelCustomPlugin implements Plugin.PluginBase {
  id = "meionovel";
  name = "MeioNovel Custom";
  icon = "src/id/meionovel/icon.png";
  site = SITE;
  version = "3.1.0";
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

    if (/^\s*[\[{]/.test(html)) {
      try {
        jsonChaptersOf(JSON.parse(html), base, slug).forEach((item) =>
          add(item.path, item.name),
        );
      } catch (error) {
        // bukan JSON utuh, lanjut ke regex di bawah
      }
    }

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

  private async getText(
    url: string,
    extra?: Record<string, string>,
  ): Promise<string> {
    try {
      const response = await fetchApi(url, {
        headers: { ...REQUEST_HEADERS, ...(extra || {}) },
      });
      return response.ok ? await response.text() : "";
    } catch (error) {
      return "";
    }
  }

  private endpointCandidates(rawHtml: string): string[] {
    const $ = parseHTML(rawHtml);
    const found: string[] = [];
    const asset =
      /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|map|mp3|mp4)(\?|$)/i;
    const bad =
      /logout|delete|destroy|bookmark|favorit|like|vote|report|comment|login|register|password|csrf|search|epub|pdf|download|theme|locale|language|subscribe|rating|notification|history|progress|setting|profile|account|storage/i;
    const push = (value: string) => {
      const v = value.trim();
      if (
        !/^(https?:\/\/(www\.)?meionovels\.com)?\/[A-Za-z0-9_\-\/.%?=&:]*$/i.test(
          v,
        )
      ) {
        return;
      }
      if (v === "/" || asset.test(v) || bad.test(v)) return;
      const abs = absoluteUrl(v);
      if (!found.includes(abs)) found.push(abs);
    };
    $("*").each((_, element) => {
      const attribs = ((element as unknown) as { attribs?: Record<string, string> })
        .attribs;
      if (!attribs) return;
      for (const name of Object.keys(attribs)) {
        if (!/^(data-|x-|hx-|@|:|action$|formaction$)/i.test(name)) continue;
        const value = String(attribs[name]);
        push(value);
        const re = /['"](\/[A-Za-z0-9_\-\/.%?=&:]+)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(value))) push(match[1]);
      }
    });
    return found.slice(0, 16);
  }

  private async chaptersFromEndpoints(
    rawHtmls: string[],
    cleanPath: string,
    referer: string,
    known: Plugin.ChapterItem[],
  ): Promise<Plugin.ChapterItem[]> {
    const urls: string[] = [];
    rawHtmls.forEach((html) =>
      this.endpointCandidates(html).forEach((url) => {
        if (!urls.includes(url)) urls.push(url);
      }),
    );
    for (const url of urls.slice(0, 14)) {
      const text = await this.getText(url, apiHeaders(referer));
      if (!text || !/^\s*[\[{]/.test(text)) continue;
      let found = this.discoverChapters(text, cleanPath, known);
      if (found.length < 3) continue;

      // paginasi gaya Laravel: ikuti next_page_url sampai habis
      let json: any;
      try {
        json = JSON.parse(text);
      } catch (error) {
        json = undefined;
      }
      let next: unknown =
        json?.next_page_url ||
        json?.links?.next ||
        json?.meta?.next ||
        json?.pagination?.next_page_url;
      for (let i = 0; typeof next === "string" && next && i < 400; i++) {
        const pageText = await this.getText(
          absoluteUrl(next),
          apiHeaders(referer),
        );
        if (!pageText) break;
        found = this.discoverChapters(pageText, cleanPath, found);
        try {
          const pageJson = JSON.parse(pageText);
          next =
            pageJson?.next_page_url ||
            pageJson?.links?.next ||
            pageJson?.meta?.next ||
            pageJson?.pagination?.next_page_url;
        } catch (error) {
          break;
        }
      }
      return found;
    }
    return known;
  }

  private async contentFromEndpoints(
    rawHtml: string,
    pageUrl: string,
  ): Promise<{ html?: string; log: string[] }> {
    const log: string[] = [];
    for (const url of this.endpointCandidates(rawHtml).slice(0, 12)) {
      const label = url.replace(SITE, "/").slice(0, 60);
      const text = await this.getText(url, apiHeaders(pageUrl));
      if (!text) {
        log.push(`${label}:empty`);
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (error) {
        log.push(`${label}:html${text.length}`);
        continue;
      }
      const content = contentFromJson(json);
      log.push(`${label}:json${content.length}`);
      if (content.length >= 600 && !PLACEHOLDER_RE.test(content)) {
        return { html: contentToHtml(content), log };
      }
    }
    return { log };
  }

  private async postJson(
    url: string,
    body: unknown,
    csrf: string,
    referer: string,
  ): Promise<{ ok: boolean; status: number; data: any }> {
    try {
      const response = await fetchApi(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": csrf,
          "X-Requested-With": "XMLHttpRequest",
          Referer: referer,
          Origin: SITE.replace(/\/+$/, ""),
        },
        body: JSON.stringify(body),
      });
      let data: any = {};
      try {
        data = JSON.parse(await response.text());
      } catch (error) {
        data = {};
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: {} };
    }
  }

  // Isi chapter: POST contentUrl {chapter, token} -> {k, p} -> XOR -> HTML
  private async contentViaApi(
    rawHtml: string,
    pageUrl: string,
  ): Promise<{ html?: string; log: string }> {
    let html = rawHtml;
    for (let attempt = 0; attempt < 2; attempt++) {
      const $ = parseHTML(html);
      const xdata = $('[x-data*="reader"]').first().attr("x-data") || "";
      let cfg = readConfig(xdata, ["contentUrl", "contentToken", "chapterId"]);
      if (!cfg.contentUrl || !cfg.contentToken) {
        cfg = readConfig(html, ["contentUrl", "contentToken", "chapterId"]);
      }
      if (!cfg.contentUrl || !cfg.contentToken) {
        return {
          log: `cfg-missing url=${!!cfg.contentUrl} token=${!!cfg.contentToken} xdata=${xdata.slice(0, 160)}`,
        };
      }
      const csrf = $('meta[name="csrf-token"]').attr("content") || "";
      const res = await this.postJson(
        absoluteUrl(cfg.contentUrl),
        { chapter: asIdValue(cfg.chapterId), token: cfg.contentToken },
        csrf,
        pageUrl,
      );
      if (res.ok && res.data && res.data.k && Array.isArray(res.data.p)) {
        const decoded = decodePayload(res.data);
        if (decoded.replace(/<[^>]+>/g, "").trim().length > 0) {
          return { html: decoded, log: "ok" };
        }
        return { log: "decoded-empty" };
      }
      if (res.status === 419 && attempt === 0) {
        html = (await this.getHtml(pageUrl)).html; // segarkan sesi + token lalu coba lagi
        continue;
      }
      return {
        log: `post ${res.status} keys=${Object.keys(res.data || {}).join(",")} msg=${String(res.data?.pesan || "").slice(0, 80)}`,
      };
    }
    return { log: "retry-exhausted" };
  }

  // Daftar chapter: POST {novel, token, params} -> {html} (berpaginasi lewat params.page)
  private async chaptersViaApi(
    pageHtml: string,
    cleanPath: string,
    novelUrl: string,
  ): Promise<Plugin.ChapterItem[]> {
    const attempt = async (
      html: string,
      referer: string,
    ): Promise<Plugin.ChapterItem[]> => {
      const $ = parseHTML(html);
      const csrf = $('meta[name="csrf-token"]').attr("content") || "";
      let url = "";
      let makeBody: (params: Record<string, string>) => unknown = () => ({});

      const listX = $('[x-data*="chapterList"]').first().attr("x-data") || "";
      let list = readConfig(listX || html, ["url", "novel", "token"]);
      if (list.url && list.token && list.novel) {
        url = absoluteUrl(list.url);
        makeBody = (params) => ({
          novel: asIdValue(list.novel),
          token: list.token,
          params,
        });
      } else {
        const readerX = $('[x-data*="reader"]').first().attr("x-data") || "";
        list = readConfig(readerX || html, [
          "listUrl",
          "listToken",
          "novelId",
          "chapterId",
        ]);
        if (!list.listUrl || !list.listToken) return [];
        url = absoluteUrl(list.listUrl);
        makeBody = () => ({
          novel: asIdValue(list.novelId),
          chapter: asIdValue(list.chapterId),
          token: list.listToken,
        });
      }

      const first = await this.postJson(url, makeBody({}), csrf, referer);
      if (first.status === 419) return [];
      if (!first.ok || typeof first.data?.html !== "string") return [];

      let found = this.discoverChapters(first.data.html, cleanPath, []);
      const pageNumbers = (first.data.html.match(/[?&]page=(\d+)/g) || []).map(
        (m: string) => Number(m.replace(/\D/g, "")),
      );
      let maxPage = Math.max.apply(null, [1].concat(pageNumbers));
      ["last_page", "total_pages", "pages", "page_count", "max_page"].forEach(
        (key) => {
          const value = Number(first.data[key]);
          if (value > maxPage) maxPage = value;
        },
      );

      let limit = maxPage > 1 ? maxPage : 2;
      for (let page = 2; page <= Math.min(limit, 600); page++) {
        const res = await this.postJson(
          url,
          makeBody({ page: String(page) }),
          csrf,
          referer,
        );
        if (!res.ok || typeof res.data?.html !== "string") break;
        const merged = this.discoverChapters(res.data.html, cleanPath, found);
        if (merged.length <= found.length) break; // tidak ada chapter baru
        found = merged;
        if (maxPage <= 1) limit = page + 1; // jumlah halaman tidak diketahui
      }
      return found;
    };

    let chapters = await attempt(pageHtml, novelUrl);
    if (!chapters.length) {
      // sesi/token mungkin kedaluwarsa: ambil halaman segar sekali lagi
      const fresh = await this.getHtml(novelUrl);
      chapters = await attempt(fresh.html, novelUrl);
    }
    if (!chapters.length) {
      // cadangan: daftar isi dari halaman chapter pertama
      const firstPath = this.discoverChapters(pageHtml, cleanPath, [])[0]?.path;
      if (firstPath) {
        const chapterUrl = `${SITE}${firstPath}/`;
        const chapterPage = await this.getHtml(chapterUrl);
        chapters = await attempt(chapterPage.html, chapterUrl);
      }
    }
    return chapters;
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
    const page = await this.getHtml(novelUrl);
    const chapterHtml = "";

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
    let chapters = await this.chaptersViaApi(page.html, cleanPath, novelUrl);
    if (!chapters.length) {
      chapters = chapterHtml ? this.parseChapters(chapterHtml, cleanPath) : [];
    }
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

    if (chapters.length < 5) {
      const firstPath = chapters[0]?.path;
      const firstHtml = firstPath ? await this.getText(`${SITE}${firstPath}/`) : "";
      const viaApi = await this.chaptersFromEndpoints(
        [page.html, firstHtml],
        cleanPath,
        novelUrl,
        chapters,
      );
      if (viaApi.length > chapters.length) chapters = viaApi;
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

  private async describeDynamic(rawHtml: string, log: string[]): Promise<string> {
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
    parts.push(
      `eps=${this.endpointCandidates(rawHtml)
        .map((url) => url.replace(SITE, "/"))
        .slice(0, 12)
        .join(",")}`,
    );
    parts.push(`probe=${log.join(" ; ")}`);
    parts.push(
      `forms=${$("form")
        .map((_, el) => `${$(el).attr("method") || "get"}:${$(el).attr("action") || ""}`)
        .get()
        .slice(0, 5)
        .join(",")}`,
    );
    parts.push(
      `xdata=${$("[x-data]")
        .map((_, el) => ($(el).attr("x-data") || "").replace(/\s+/g, " ").slice(0, 110))
        .get()
        .filter(Boolean)
        .slice(0, 3)
        .join(" || ")}`,
    );

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
    return parts.join(" | ").slice(0, 2400);
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

    // 0) isi sudah ada di HTML (tanpa token) atau diambil lewat API situs
    for (const selector of ['[x-ref="body"]', ".reader-body"]) {
      const body = $(selector).first();
      if (usable(body, 200)) {
        const html = finish(body);
        if (html) return html;
      }
    }
    const api = await this.contentViaApi(rawHtml, `${SITE}${cleanPath}/`);
    if (api.html) return api.html;

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

    const viaApi = await this.contentFromEndpoints(
      rawHtml,
      `${SITE}${cleanPath}/`,
    );
    if (viaApi.html) return viaApi.html;

    const dynamic = await this.describeDynamic(rawHtml, [
      `api=${api.log}`,
      ...viaApi.log,
    ]);
    throw new Error(
      `MeioNovel chapter content is loaded by JS: ${cleanPath} | DYN: ${dynamic}`,
    );
  }

  resolveUrl = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${SITE}${normalizePath(path)}/`;
}

export default new MeioNovelCustomPlugin();
