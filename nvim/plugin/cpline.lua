-- Claude Powerline TUI - auto-load
-- Registers :Cpline command on startup

if vim.g.loaded_cpline then
  return
end
vim.g.loaded_cpline = true

require("cpline").setup()
