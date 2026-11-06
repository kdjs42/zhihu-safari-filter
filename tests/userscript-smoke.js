(() => {
  let saved = { keywords: ['摄影'], blockAds: true, enabled: true };
  let shadow;
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function(options) {
    const result = attach.call(this, options);
    if (this.id === 'zhihu-filter-userscript') shadow = result;
    return result;
  };
  window.GM = {
    async getValue() { return saved; },
    async setValue(_key, value) { saved = JSON.parse(JSON.stringify(value)); }
  };
  const waitFor = async predicate => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 3000) throw Error('等待界面响应超时');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  window.runUserscriptSmoke = async () => {
    Element.prototype.attachShadow = attach;
    try {
      if (!shadow) throw Error('未加载脚本，请先运行 npm run build:userscript');
      const $ = id => shadow.getElementById(id);
      $('launcher').click();await waitFor(() => !$('fields').disabled);
      if (!shadow.querySelector('dialog').open || $('keywords').value !== '摄影') throw Error('设置弹窗未正确加载');
      $('keywords').value = ' 饭圈\nＡＩ\nai';
      $('settings').dispatchEvent(new Event('submit', { cancelable: true }));
      await waitFor(() => $('message').textContent.includes('已保存'));
      if (saved.keywords.join(',') !== '饭圈,ai') throw Error('词表未正确保存');
      $('export-settings').click();
      const exported = JSON.parse($('backup').value);
      if (exported.keywords.join(',') !== '饭圈,ai') throw Error('备份不一致');
      $('backup').value = '{"keywords":["星空"],"enabled":false}';
      $('import-settings').click();
      if ($('keywords').value !== '星空' || saved.enabled !== true) throw Error('导入应先预览，保存后才生效');
      $('settings').dispatchEvent(new Event('submit', { cancelable: true }));
      await waitFor(() => saved.enabled === false);
      $('close-panel').click();
      await waitFor(() => !shadow.querySelector('dialog').open);
      $('launcher').click();await waitFor(() => !$('fields').disabled);
      if ($('keywords').value !== '星空' || $('enabled').checked) throw Error('重新打开后设置未恢复');
      $('close-panel').click();
      document.getElementById('result').textContent = '自检通过：原生设置弹窗、词表保存与恢复、备份导出、导入预览与保存。左下角可继续试用。';
    } catch (error) { document.getElementById('result').textContent = `自检失败：${error.message}`; }
  };
})();
