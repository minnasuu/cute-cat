import type { SkillHandler, SkillContext, SkillResult } from './types';

const CRAFT_API = 'https://suminhan.cn/api/crafts';

/** 🎨 查看 Crafts — 管理员私有
 *  通过 iframe 加载 API 获取 Crafts 数据
 */
const viewCrafts: SkillHandler = {
  id: 'view-crafts',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[view-crafts] agent=${ctx.agentId} @${ctx.timestamp}`);

    let craftId = '';
    const input = ctx.input as Record<string, unknown> | string | undefined;
    if (typeof input === 'string') {
      craftId = input.trim();
    } else if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      craftId = String(params.craftId || '').trim();
    }

    const url = craftId ? `${CRAFT_API}/${craftId}` : CRAFT_API;

    try {
      const data = await loadViaIframe(url);

      const summary = craftId
        ? `已获取 Craft 详情: ${(data as any).name || craftId}`
        : `共获取 ${Array.isArray(data) ? data.length : 0} 个 Crafts`;

      return { success: true, data, summary, status: 'success' };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        summary: `查看 Crafts 失败: ${err.message}`,
        status: 'error',
      };
    }
  },
};

/** 创建隐藏 iframe 加载 URL，读取返回的 JSON 内容 */
function loadViaIframe(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('iframe 加载超时'));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      iframe.remove();
    }

    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const text = doc?.body?.innerText || doc?.body?.textContent || '';
        cleanup();
        if (!text.trim()) {
          reject(new Error('iframe 内容为空'));
          return;
        }
        resolve(JSON.parse(text));
      } catch {
        cleanup();
        // 跨域无法读取 iframe 内容，回退到 fetch
        fetch(url)
          .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
          .then(resolve)
          .catch(reject);
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error('iframe 加载失败'));
    };

    document.body.appendChild(iframe);
  });
}

export default viewCrafts;
