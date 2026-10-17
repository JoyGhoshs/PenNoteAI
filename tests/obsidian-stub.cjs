class Base {}
module.exports = {
  Plugin: Base, PluginSettingTab: Base, Setting: Base, Modal: Base,
  ItemView: Base, TFile: Base, Notice: Base, WorkspaceLeaf: Base,
  MarkdownRenderer: {},
  requestUrl: async () => { throw new Error('Unexpected Obsidian network request'); },
};
