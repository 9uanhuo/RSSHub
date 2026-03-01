import { load } from 'cheerio';
import type { Context } from 'hono';

import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/mse/news/:type',
    categories: ['university'],
    example: '/mse/news/zstz',
    name: '在职工程硕士管理中心',
    maintainers: ['9uanhuo'],
    url: 'https://www.mse.fudan.edu.cn',
    parameters: {
        type: {
            description: '信息类型',
            options: [
                {
                    value: 'zstz',
                    label: '招生通知',
                },
                {
                    value: 'jxtz',
                    label: '教学通知',
                },
                {
                    value: 'xwtz',
                    label: '学位通知',
                },
                {
                    value: 'xstz',
                    label: '学生通知',
                },
            ],
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['https://www.mse.fudan.edu.cn/13262/list.htm'],
            target: '/mse/news/zstz',
        },
        {
            source: ['https://www.mse.fudan.edu.cn/13263/list.htm'],
            target: '/mse/news/jxtz',
        },
        {
            source: ['https://www.mse.fudan.edu.cn/13264/list.htm'],
            target: '/mse/news/xwtz',
        },
        {
            source: ['https://www.mse.fudan.edu.cn/13265/list.htm'],
            target: '/mse/news/xstz',
        },
    ],
    handler,
};

async function handler(ctx: Context) {
    let type = ctx.req.param('type'); // 默认类型为招生通知
    if (!type) {
        type = 'zstz';
    }
    const rootUrl = 'https://www.mse.fudan.edu.cn';
    let currentUrl: string;
    let pageTitle: string;

    if (type === 'zstz') {
        currentUrl = `${rootUrl}/13262/list.htm`;
        pageTitle = '招生通知';
    } else if (type === 'jxtz') {
        currentUrl = `${rootUrl}/13263/list.htm`;
        pageTitle = '教学通知';
    } else if (type === 'xwtz') {
        currentUrl = `${rootUrl}/13264/list.htm`;
        pageTitle = '学位通知';
    } else if (type === 'xstz') {
        currentUrl = `${rootUrl}/13265/list.htm`;
        pageTitle = '学生通知';
    } else {
        throw new Error('Invalid type parameter');
    }

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(response.data);
    const list: DataItem[] = [];
    for (const item of $('#wp_news_w7 > table > tbody > tr').toArray()) {
        const $link = $(item).find('a');
        // Skip elements without links or with empty href
        if ($link.length === 0 || !$link.attr('href')) {
            continue;
        }
        list.push({
            title: $link.attr('title')?.trim() || $link.text().trim(),
            link: rootUrl + $link.attr('href'),
        });
    }

    const items = await Promise.all(
        list
            .filter((item) => item && item.link)
            .map((item) =>
                cache.tryGet(item.link as string, async () => {
                    const detailResponse = await got({
                        method: 'get',
                        url: item.link,
                    });
                    const content = load(detailResponse.data);
                    // 选择包含新闻内容的元素
                    const newsContent = content('#container > div > table > tbody > tr');
                    const publishInfo = newsContent.find('table.border2 > tbody > tr > td').text();
                    const matchDate = publishInfo.match(/发布时间：\s*(\d{4}-\d{2}-\d{2})/);
                    if (matchDate) {
                        item.pubDate = parseDate(matchDate[1]);
                    }
                    const matchAuthor = publishInfo.match(/发布人：\s*([^\u00A0\s]*)/);
                    if (matchAuthor) {
                        item.author = matchAuthor[1];
                    }
                    return item;
                })
            )
    );
    return {
        title: `复旦大学 - MSE ${pageTitle}`,
        link: currentUrl,
        item: items,
    };
}
