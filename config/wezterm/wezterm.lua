local wezterm = require("wezterm")
local act = wezterm.action
local config = wezterm.config_builder()

config.hide_tab_bar_if_only_one_tab = true

-- Window size 
config.initial_cols = 190
config.initial_rows = 70

-- Theme (https://wezterm.org/colorschemes/index.html)
-- Alternatives:
--   "Catppuccin Mocha"         : light version of Catppuccin
--   "Tokyo Night"              : cool blue/purple
--   "Dracula (Official)"       : purple/pink classic dark
--   "Gruvbox Dark (Gogh)"      : warm brown/orange retro
--   "Nord"                     : cold blue
--   "One Dark (Gogh)"          : Atom editor style
--   "Solarized Dark (Gogh)"    : classic dark blue
--   "Kanagawa (Gogh)"          : Japanese-style blue/purple
--   "rose-pine"                : soft pink/purple
--   "Nightfox (Gogh)"          : deep navy blue
-- config.color_scheme = "Catppuccin Mocha"
config.color_scheme = "Catppuccin Mocha"

-- Font
-- Alternatives (install via: brew install --cask font-<name>-nerd-font):
--   "JetBrains Mono"           : popular programming font, clean ligatures
--   "Fira Code"                : ligature-rich programming font
--   "CaskaydiaCove Nerd Font"  : Cascadia Code + Nerd Font icons
--   "MesloLGS Nerd Font"       : Meslo patched, great for Powerlevel10k
--   "Iosevka Nerd Font"        : narrow, space-efficient monospace
--   "D2Coding"                 : Korean-friendly programming font
--   "Victor Mono"              : italic cursive style
--   "Monaspace Neon"           : GitHub's monospace font family
config.font = wezterm.font_with_fallback({
	"Hack Nerd Font",
	"JetBrains Mono",
})
config.font_size = 12.0

-- IME (한글 입력 지원)
config.use_ime = true
config.macos_forward_to_ime_modifier_mask = "SHIFT|CTRL"

-- Option key as Meta (send ESC+key instead of composed characters like π, ø)
config.send_composed_key_when_left_alt_is_pressed = false
config.send_composed_key_when_right_alt_is_pressed = false

-- Pane border
config.inactive_pane_hsb = {
	saturation = 0.8,
	brightness = 0.7,
}
config.colors = {
	split = "#6e4f8a", -- soft purple (complementary to dark background)
	tab_bar = {
		background = "#6e4f8a",
		active_tab = {
			bg_color = "#8b6aac",
			fg_color = "#1e1e2e",
		},
		inactive_tab = {
			bg_color = "#5b416f",
			fg_color = "#cdd6f4",
		},
		inactive_tab_hover = {
			bg_color = "#6e4f8a",
			fg_color = "#cdd6f4",
		},
		new_tab = {
			bg_color = "#5b416f",
			fg_color = "#cdd6f4",
		},
		new_tab_hover = {
			bg_color = "#8b6aac",
			fg_color = "#1e1e2e",
		},
	},
}
config.window_frame = {
	active_titlebar_bg = "#6e4f8a",
	inactive_titlebar_bg = "#5b416f",
}

config.keys = {
	-- Split pane: Cmd+D (horizontal), Cmd+Shift+D (vertical)
	{
		key = "mapped:d",
		mods = "CMD",
		action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }),
	},
	{
		key = "mapped:d",
		mods = "CMD|SHIFT",
		action = act.SplitVertical({ domain = "CurrentPaneDomain" }),
	},
	-- Word jump: Option+Left/Right
	{
		key = "LeftArrow",
		mods = "OPT",
		action = act.SendString("\x1bb"),
	},
	{
		key = "RightArrow",
		mods = "OPT",
		action = act.SendString("\x1bf"),
	},
	-- Line jump: Cmd+Left (Home), Cmd+Right (End)
	{
		key = "LeftArrow",
		mods = "CMD",
		action = act.SendString("\x01"),
	},
	{
		key = "RightArrow",
		mods = "CMD",
		action = act.SendString("\x05"),
	},
	-- Clear entire line: Cmd+Backspace
	{
		key = "Backspace",
		mods = "CMD",
		action = act.SendString("\x15"),
	},
	-- Tab switch: Cmd+Opt+Left/Right
	{
		key = "LeftArrow",
		mods = "CMD|OPT",
		action = act.ActivateTabRelative(-1),
	},
	{
		key = "RightArrow",
		mods = "CMD|OPT",
		action = act.ActivateTabRelative(1),
	},
	-- Move tab: Cmd+Shift+Left/Right
	{
		key = "LeftArrow",
		mods = "CMD|SHIFT",
		action = act.MoveTabRelative(-1),
	},
	{
		key = "RightArrow",
		mods = "CMD|SHIFT",
		action = act.MoveTabRelative(1),
	},
	-- Rename tab: Cmd+Shift+R
	{
		key = "mapped:r",
		mods = "CMD|SHIFT",
		action = act.PromptInputLine({
			description = "Tab name:",
			action = wezterm.action_callback(function(window, pane, line)
				if line then
					window:active_tab():set_title(line)
				end
			end),
		}),
	},
	-- Close current pane (if split), or close tab (if single pane)
	{
		key = "mapped:w",
		mods = "CMD",
		action = act.CloseCurrentPane({ confirm = true }),
	},
	-- Korean IME: Opt+ㅔ → same as Opt+p (ESC+p)
	{
		key = "ㅔ",
		mods = "OPT",
		action = act.SendString("\x1bp"),
	},
}

return config
