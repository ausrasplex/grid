export * from "./types";
export { cn, newId } from "./lib/utils";
export { describeDevice } from "./lib/devices";
export { THEMES, themeOf, lookOf, themeAttributes, themeColour, customThemeIdOf, showThemeNow, type ThemeId, type Look } from "./lib/themes";
export {
  KEY_COLOURS,
  THEME_TOKENS,
  STARTERS,
  HEX_COLOUR,
  CUSTOM_THEME_STYLE_ID,
  starterOf,
  deriveTokens,
  resolveTokens,
  readabilityWarnings,
  tokenStyle,
  tokensCss,
  contrast,
  isDark,
  isTokenName,
  type KeyColours,
  type KeyColourName,
  type TokenName,
  type ThemeTokens,
  type TokenOverrides,
  type ReadabilityWarning,
} from "./lib/custom-themes";

// shadcn/ui components
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { Input } from "./components/input";
export { Label } from "./components/label";
export { NativeSelect, type NativeSelectProps, type SelectOption, type SelectChange } from "./components/native-select";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./components/card";
export { Badge, badgeVariants } from "./components/badge";
export { Alert } from "./components/alert";
export { Switch } from "./components/switch";
export { Checkbox } from "./components/checkbox";
export { Sheet, SheetTrigger, SheetClose, SheetContent } from "./components/sheet";

// Layout building blocks + fields
export * from "./blocks";
export { Field, SelectField } from "./fields";
export { AddressField, type AddressPick, type SiteMatch } from "./address-field";
export { Crumbs, type Crumb } from "./crumbs";
export { HomeTile, AttentionRow, AttentionList } from "./home";
export { Icon, ICONS } from "./icons";
export { Scroller, useOverflow } from "./scroller";
export { PageViewer, type FindMatch, type ViewerPage } from "./page-viewer";

// Client data helpers
export { api, useApi, useAction, ApiError } from "./api";
export { Segmented, SearchInput, SelectRow, formatBytes, whenRemoved } from "./controls";

// The plan viewer's overlay (Plans provides it; Markups and Photos draw on it)
export {
  PlanLayer,
  PlanMarkupSection,
  PlanOverlayProvider,
  PlanToolButton,
  toScreen,
  usePlanOverlay,
  usePlanPointer,
  type MarkupProgress,
  type PlanOverlayValue,
  type PlanPointer,
  type PlanVersionInfo,
  type PlanView,
  type PlanViewerPanelProps,
  type SelectedMarkup,
  type SheetPoint,
} from "./plan-overlay";

// The spreadsheet viewer's slot (Documents provides it; Sign-offs adds to it)
export {
  SheetRowCard,
  SheetSlotProvider,
  SheetToolbar,
  useSheetColumn,
  useSheetFilter,
  useSheetSlot,
  type SheetColumn,
  type SheetInfo,
  type SheetSlotValue,
  type SheetViewerPanelProps,
} from "./sheet-slot";

// The quote editor's take-off slot (Quotes provides it; Markups fills it)
export { QuoteTakeoffProvider, useQuoteTakeoff, type QuoteTakeoffPanelProps, type QuoteTakeoffValue, type TakeoffLine } from "./quote-slot";

// Picking a picture for a business, a client or a client business
export { EditablePicture, PicturePicker, sendPicture } from "./picture-picker";
export { shareFile } from "./share-file";
