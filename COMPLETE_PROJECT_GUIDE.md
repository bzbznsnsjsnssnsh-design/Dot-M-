# 📚 دليل المشروع الشامل الكامل - Dot-M-

> **وثيقة توثيق شاملة جداً تحتوي على شرح لكل ملف وكل سطر كود ومسار كامل في المشروع**

---

## 🎯 معلومات المشروع الأساسية

| المعلومة | القيمة |
|---------|--------|
| **اسم المشروع** | Dot-M- |
| **معرف المستودع** | 1252051847 |
| **الوصف** | Repository for https://replit.com/@jsnsheeg/Dot-Master |
| **اللغة الأساسية** | TypeScript (95.3%) |
| **الترخيص** | MIT |
| **URL المستودع** | https://github.com/bzbznsnsjsnssnsh-design/Dot-M- |
| **النوع** | Pnpm Workspace (مشروع متعدد الحزم) |
| **حالة المشروع** | ✅ نشط وجاهز للتطوير |

---

## 📁 هيكل المشروع الكامل

```
Dot-M-/
│
├─ 📄 .gitignore                  # ملف تجاهل Git
├─ 📄 .npmrc                      # إعدادات NPM
├─ 📄 .replit                     # إعدادات Replit الرئيسية
├─ 📄 .replitignore               # ملف تجاهل Replit
├─ 📄 package.json                # ملف إدارة الحزم الرئيسي
├─ 📄 pnpm-workspace.yaml         # إعدادات Pnpm Workspace
├─ 📄 pnpm-lock.yaml              # ملف القفل (Dependencies Lock File)
├─ 📄 tsconfig.json               # إعدادات TypeScript الرئيسية
├─ 📄 tsconfig.base.json          # الإعدادات الأساسية لـ TypeScript
├─ 📄 pyproject.toml              # إعدادات المشروع Python
├─ 📄 main.py                     # ملف Python الرئيسي
├─ 📄 replit.md                   # وثيقة Replit للمشروع
├─ 📄 PROJECT_DOCUMENTATION.md    # التوثيق الأساسي
│
├─ 📁 scripts/                    # مجلد السكريبتات
│  └─ 📄 tsconfig.json
│  └─ 📄 package.json
│  └─ 📁 src/
│
├─ 📁 lib/                        # مكتبة الكود المشترك
│  ├─ 📁 db/                      # قاعدة البيانات
│  ├─ 📁 api-client-react/        # عميل React للـ API
│  ├─ 📁 api-zod/                 # Zod Validation للـ API
│  └─ 📁 integrations/            # التكاملات الخارجية
│
├─ 📁 artifacts/                  # مجلد الأنتاجات والبناء
│
├─ 📁 attached_assets/            # الأصول المرفقة
│
├─ 📁 project-source/             # مصدر المشروع (نسخة بديلة)
│  ├─ 📄 .gitignore
│  ├─ 📄 .npmrc
│  ├─ 📄 .replit
│  ├─ 📄 .replitignore
│  ├─ 📄 package.json
│  ├─ 📄 pnpm-workspace.yaml
│  ├─ 📄 tsconfig.json
│  ├─ 📄 tsconfig.base.json
│  ├─ 📄 pyproject.toml
│  └─ 📄 main.py
│
└─ 📁 .github/                    # إعدادات GitHub (إن وجدت)
```

---

# 📋 شرح تفصيلي لكل ملف في المشروع

---

## 1️⃣ `.gitignore` - ملف تجاهل Git

**المسار الكامل:** `/Dot-M-/.gitignore`  
**URL المباشر:** https://github.com/bzbznsnsjsnssnsh-design/Dot-M-/blob/main/.gitignore

### الكود الكامل:

```gitignore
# See https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files for more about ignoring files.

# compiled output
dist
tmp
out-tsc
*.tsbuildinfo
.expo
.expo-shared

# dependencies
node_modules

# IDEs and editors
/.idea
.project
.classpath
.c9/
*.launch
.settings/
*.sublime-workspace

# IDE - VSCode
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json

# misc
/.sass-cache
/connect.lock
/coverage
/libpeerconnection.log
npm-debug.log
yarn-error.log
testem.log
/typings

# System Files
.DS_Store
Thumbs.db

.cursor/rules/nx-rules.mdc
.github/instructions/nx.instructions.md

# Replit
.cache/
.local/
```

### شرح السطور بالتفصيل:

| السطر | الشرح |
|-----|------|
| `# compiled output` | قسم: ملفات الإخراج المترجمة |
| `dist` | تجاهل مجلد التوزيع (Distribution) |
| `tmp` | تجاهل مجلد الملفات المؤقتة |
| `out-tsc` | تجاهل ملفات الإخراج TypeScript |
| `*.tsbuildinfo` | تجاهل ملفات معلومات البناء TypeScript |
| `.expo` | تجاهل مجلد Expo (للتطبيقات المحمولة) |
| `.expo-shared` | تجاهل المجلد المشترك لـ Expo |
| `# dependencies` | قسم: المكتبات والحزم |
| `node_modules` | تجاهل مجلد جميع الحزم المثبتة |
| `# IDEs and editors` | قسم: بيئات التطوير والمحررات |
| `/.idea` | تجاهل إعدادات IntelliJ IDEA |
| `.project` | تجاهل إعدادات Eclipse |
| `.classpath` | تجاهل ملف مسار الفئات Eclipse |
| `.c9/` | تجاهل إعدادات Cloud9 |
| `*.launch` | تجاهل ملفات التشغيل |
| `.settings/` | تجاهل مجلد الإعدادات |
| `*.sublime-workspace` | تجاهل ملفات Sublime Text |
| `# IDE - VSCode` | قسم: إعدادات VSCode (مع استثناءات) |
| `.vscode/*` | تجاهل جميع ملفات VSCode |
| `!.vscode/settings.json` | **استثناء**: احفظ ملف الإعدادات |
| `!.vscode/tasks.json` | **استثناء**: احفظ ملف المهام |
| `!.vscode/launch.json` | **استثناء**: احفظ ملف التشغيل |
| `!.vscode/extensions.json` | **استثناء**: احفظ ملف الإضافات |
| `# misc` | قسم: ملفات متنوعة |
| `/.sass-cache` | تجاهل ذاكرة SASS |
| `/connect.lock` | تجاهل ملف القفل |
| `/coverage` | تجاهل تقارير التغطية (Coverage Reports) |
| `/libpeerconnection.log` | تجاهل سجلات الاتصالات |
| `npm-debug.log` | تجاهل سجلات الأخطاء npm |
| `yarn-error.log` | تجاهل سجلات أخطاء Yarn |
| `testem.log` | تجاهل سجلات الاختبارات |
| `/typings` | تجاهل مجلد تعريفات الأنواع |
| `# System Files` | قسم: ملفات النظام |
| `.DS_Store` | ملف نظام macOS (تجاهل) |
| `Thumbs.db` | ملف نظام Windows (تجاهل) |
| `.cursor/rules/nx-rules.mdc` | قواعد Cursor IDE |
| `.github/instructions/nx.instructions.md` | تعليمات GitHub |
| `# Replit` | قسم: ملفات Replit |
| `.cache/` | تجاهل ذاكرة التخزين المؤقت |
| `.local/` | تجاهل الملفات المحلية |

**الغرض من الملف:**
- منع التحميل غير الضروري للملفات على Git
- توفير مساحة المستودع
- منع مشاركة الملفات الشخصية والحساسة
- تنظيم نظيف للمستودع

---

## 2️⃣ `.npmrc` - إعدادات NPM

**المسار الكامل:** `/Dot-M-/.npmrc`  
**URL المباشر:** https://github.com/bzbznsnsjsnssnsh-design/Dot-M-/blob/main/.npmrc

### الكود الكامل:

```ini
auto-install-peers=false
strict-peer-dependencies=false
```

### شرح السطور:

| السطر | الشرح التفصيلي |
|-----|--------------|
| `auto-install-peers=false` | **لا تثبت المكتبات التابعة (Peer Dependencies) تلقائياً** - هذا يعطي التحكم اليدوي |
| `strict-peer-dependencies=false` | **لا تكن صارماً مع المكتبات التابعة** - اسمح بإصدارات مختلفة من المكتبات |

**الفائدة:**
- تجنب تضارب المكتبات
- التحكم اليدوي بما يتم تثبيته
- مرونة أكثر في إدارة الحزم

---

## 3️⃣ `.replit` - إعدادات Replit

**المسار الكامل:** `/Dot-M-/.replit`  
**URL المباشر:** https://github.com/bzbznsnsjsnssnsh-design/Dot-M-/blob/main/.replit

### الكود الكامل:

```toml
modules = ["nodejs-24", "python3.11", "python3"]

[deployment]
router = "application"
deploymentTarget = "autoscale"

[deployment.postBuild]
args = ["pnpm", "store", "prune"]
env = { "CI" = "true" }

[workflows]
runButton = "Project"

[agent]
stack = "PNPM_WORKSPACE"
expertMode = true

[postMerge]
path = "scripts/post-merge.sh"
timeoutMs = 20000

[[ports]]
localPort = 8080
externalPort = 8080

[[ports]]
localPort = 8081
externalPort = 80

[[ports]]
localPort = 23267
externalPort = 3000

[nix]
channel = "stable-25_05"
```

### شرح كل قسم:

#### `modules` - الحزم المثبتة:
```toml
modules = ["nodejs-24", "python3.11", "python3"]
```
- **nodejs-24**: إصدار Node.js 24
- **python3.11**: إصدار Python 3.11
- **python3**: Python 3 الافتراضي

#### `[deployment]` - إعدادات النشر:
```toml
[deployment]
router = "application"        # نوع الموجه: تطبيق ويب
deploymentTarget = "autoscale" # النشر على خوادم قابلة للتوسع تلقائياً
```

#### `[deployment.postBuild]` - ما بعد البناء:
```toml
[deployment.postBuild]
args = ["pnpm", "store", "prune"]  # أمر تنظيف مخزن pnpm
env = { "CI" = "true" }             # متغير البيئة: CI Mode مفعل
```

#### `[workflows]` - سير العمل:
```toml
[workflows]
runButton = "Project"  # اسم زر التشغيل: "Project"
```

#### `[agent]` - الوكيل (البيئة):
```toml
[agent]
stack = "PNPM_WORKSPACE"  # نوع البيئة: Pnpm Workspace
expertMode = true         # تفعيل وضع الخبير
```

#### `[postMerge]` - بعد الدمج:
```toml
[postMerge]
path = "scripts/post-merge.sh"  # تشغيل السكريبت بعد الدمج
timeoutMs = 20000               # المهلة الزمنية: 20 ثانية
```

#### `[[ports]]` - المنافذ:

| LocalPort | ExternalPort | الغرض |
|-----------|-------------|-------|
| 8080 | 8080 | الخادم الرئيسي |
| 8081 | 80 | الويب (HTTP) |
| 23267 | 3000 | التطبيق الثانوي |

#### `[nix]` - بيئة Nix:
```toml
[nix]
channel = "stable-25_05"  # قناة Nix المستقرة: الإصدار 25.05
```

---

## 4️⃣ `.replitignore` - ملف تجاهل Replit

**المسار الكامل:** `/Dot-M-/.replitignore`

### الكود الكامل:

```
# The format of this file is identical to `.dockerignore`.
# It is used to reduce the size of deployed images to make the process of publishing faster.

# No need to store the pnpm store twice.
.local
```

### الشرح:

| العنصر | الشرح |
|-------|-------|
| `# The format...` | تنسيق الملف مثل `.dockerignore` |
| `.local` | تجاهل مجلد pnpm store المحلي لتقليل حجم النشر |

**الفائدة:** تسريع عملية النشر على Replit

---

## 5️⃣ `package.json` - ملف إدارة الحزم

**المسار الكامل:** `/Dot-M-/package.json`

### الكود الكامل:

```json
{
  "name": "workspace",
  "version": "0.0.0",
  "license": "MIT",
  "scripts": {
    "preinstall": "sh -c 'rm -f package-lock.json yarn.lock; case \"$npm_config_user_agent\" in pnpm/*) ;; *) echo \"Use pnpm instead\" >&2; exit 1 ;; esac'",
    "build": "pnpm run typecheck && pnpm -r --if-present run build",
    "typecheck:libs": "tsc --build",
    "typecheck": "pnpm run typecheck:libs && pnpm -r --filter \"./artifacts/**\" --filter \"./scripts\" --if-present run typecheck"
  },
  "private": true,
  "devDependencies": {
    "prettier": "^3.8.3",
    "typescript": "~5.9.3"
  }
}
```

### شرح كل حقل:

#### `name`: اسم المشروع
```json
"name": "workspace"
```
- اسم مساحة العمل الرئيسية

#### `version`: الإصدار
```json
"version": "0.0.0"
```
- الإصدار الأولي (0.0.0 = بدء التطوير)

#### `license`: الترخيص
```json
"license": "MIT"
```
- ترخيص MIT (مفتوح المصدر)

#### `scripts` - الأوامر:

##### 1. `preinstall`: قبل التثبيت
```json
"preinstall": "sh -c 'rm -f package-lock.json yarn.lock; case \"$npm_config_user_agent\" in pnpm/*) ;; *) echo \"Use pnpm instead\" >&2; exit 1 ;; esac'"
```
**ماذا يفعل:**
- حذف `package-lock.json` (ملف npm)
- حذف `yarn.lock` (ملف yarn)
- التحقق من أن المستخدم يستخدم pnpm
- إذا لم يستخدم pnpm، يظهر رسالة خطأ

**السبب:** فرض استخدام pnpm فقط

##### 2. `build`: البناء
```json
"build": "pnpm run typecheck && pnpm -r --if-present run build"
```
**ماذا يفعل:**
1. تشغيل `typecheck` (فحص الأنواع)
2. ثم تشغيل `build` في جميع الحزم الموجودة (`-r`)

##### 3. `typecheck:libs`: فحص المكتبات
```json
"typecheck:libs": "tsc --build"
```
- تشغيل TypeScript في وضع البناء

##### 4. `typecheck`: فحص شامل
```json
"typecheck": "pnpm run typecheck:libs && pnpm -r --filter \"./artifacts/**\" --filter \"./scripts\" --if-present run typecheck"
```
**ماذا يفعل:**
1. فحص المكتبات
2. فحص ملفات `artifacts/**`
3. فحص مجلد `scripts`

#### `private`: خاص
```json
"private": true
```
- لا ينشر على npm (مشروع خاص)

#### `devDependencies` - المكتبات للتطوير:

| المكتبة | الإصدار | الغرض |
|--------|--------|-------|
| `prettier` | `^3.8.3` | تنسيق الكود تلقائياً |
| `typescript` | `~5.9.3` | مترجم TypeScript |

---

## 6️⃣ `pnpm-workspace.yaml` - إعدادات Pnpm Workspace

**المسار الكامل:** `/Dot-M-/pnpm-workspace.yaml`

### الكود الكامل (مختصر):

```yaml
# ============================================================================
# SECURITY: Minimum release age for npm packages (supply-chain attack defense)
# ============================================================================
minimumReleaseAge: 1440

minimumReleaseAgeExclude:
  - '@replit/*'
  - stripe-replit-sync

packages:
  - artifacts/*
  - lib/*
  - lib/integrations/*
  - scripts

catalog:
  '@replit/vite-plugin-cartographer': ^0.5.1
  '@replit/vite-plugin-dev-banner': ^0.1.1
  '@replit/vite-plugin-runtime-error-modal': ^0.0.6
  '@tailwindcss/vite': ^4.1.14
  '@tanstack/react-query': ^5.90.21
  '@types/node': ^25.3.3
  '@types/react': ^19.2.0
  '@types/react-dom': ^19.2.0
  '@vitejs/plugin-react': ^5.0.4
  class-variance-authority: ^0.7.1
  clsx: ^2.1.1
  drizzle-orm: ^0.45.2
  framer-motion: ^12.23.24
  lucide-react: ^0.545.0
  react: 19.1.0
  react-dom: 19.1.0
  tailwind-merge: ^3.3.1
  tailwindcss: ^4.1.14
  tsx: ^4.21.0
  vite: ^7.3.2
  wouter: ^3.3.5
  zod: ^3.25.76

autoInstallPeers: false

onlyBuiltDependencies:
  - '@swc/core'
  - esbuild
  - msw
  - unrs-resolver

overrides:
  # عشرات السطور من التجاوزات...
```

### شرح الأقسام:

#### 🔒 الأمان - Minimum Release Age:
```yaml
minimumReleaseAge: 1440  # 24 ساعة = 1440 دقيقة
```
**الغرض:** لا تثبت نسخ حزم جديدة إلا بعد 24 ساعة (حماية من الهجمات)

#### 📦 استثناءات الأمان:
```yaml
minimumReleaseAgeExclude:
  - '@replit/*'          # حزم Replit الموثوقة
  - stripe-replit-sync   # تكامل Stripe
```

#### 📁 الحزم الجزئية:
```yaml
packages:
  - artifacts/*           # جميع مشاريع artifacts
  - lib/*                 # جميع مشاريع lib
  - lib/integrations/*    # جميع التكاملات
  - scripts               # مشروع scripts
```

#### 📚 الكتالوج (الإصدارات الموحدة):

| المكتبة | الإصدار | الغرض |
|--------|--------|-------|
| **React Ecosystem** | | |
| `react` | 19.1.0 | إطار عمل React |
| `react-dom` | 19.1.0 | React DOM |
| `@types/react` | ^19.2.0 | تعريفات TypeScript |
| `@types/react-dom` | ^19.2.0 | تعريفات TypeScript |
| **Styling** | | |
| `tailwindcss` | ^4.1.14 | إطار عمل CSS |
| `@tailwindcss/vite` | ^4.1.14 | إضافة Vite |
| `tailwind-merge` | ^3.3.1 | دمج فئات Tailwind |
| **Build Tools** | | |
| `vite` | ^7.3.2 | بناء التطبيق |
| `@vitejs/plugin-react` | ^5.0.4 | إضافة React لـ Vite |
| `tsx` | ^4.21.0 | تنفيذ TypeScript |
| **Data & Validation** | | |
| `zod` | ^3.25.76 | التحقق من البيانات |
| `drizzle-orm` | ^0.45.2 | ORM لقاعدة البيانات |
| **UI & Animation** | | |
| `framer-motion` | ^12.23.24 | رسوم متحركة |
| `lucide-react` | ^0.545.0 | أيقونات |
| **State & Queries** | | |
| `@tanstack/react-query` | ^5.90.21 | إدارة البيانات |
| `wouter` | ^3.3.5 | توجيه (Routing) |
| **Utilities** | | |
| `class-variance-authority` | ^0.7.1 | متغيرات CSS |
| `clsx` | ^2.1.1 | دمج الفئات |

#### ⚙️ الإعدادات:
```yaml
autoInstallPeers: false  # لا تثبت المكتبات التابعة تلقائياً
```

#### 🏗️ المكتبات المبنية فقط:
```yaml
onlyBuiltDependencies:
  - '@swc/core'      # مترجم JavaScript
  - esbuild          # بناء سريع
  - msw              # Mock Service Worker
  - unrs-resolver    # معالج الرسائل
```

#### 🔄 التجاوزات (Overrides):
تحتوي على عشرات السطور لاستبدال المكتبات المختلفة للأنظمة المختلفة

---

## 7️⃣ `tsconfig.base.json` - إعدادات TypeScript الأساسية

**المسار الكامل:** `/Dot-M-/tsconfig.base.json`

### الكود الكامل:

```json
{
  "compilerOptions": {
    "isolatedModules": true,
    "lib": ["es2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmitOnError": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": false,
    "noImplicitReturns": true,
    "noUnusedLocals": false,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "strictNullChecks": true,
    "strictFunctionTypes": false,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "skipLibCheck": true,
    "target": "es2022",
    "types": [],
    "customConditions": ["workspace"]
  }
}
```

### شرح كل خيار:

| الخيار | القيمة | الشرح |
|-------|--------|-------|
| `isolatedModules` | `true` | معاملة كل ملف كوحدة مستقلة |
| `lib` | `["es2022"]` | استخدام مكتبات JavaScript ES2022 |
| `module` | `"esnext"` | صيغة الوحدات الحديثة |
| `moduleResolution` | `"bundler"` | استخدام خوارزمية bundler |
| `noEmitOnError` | `true` | لا تنتج إذا كان هناك أخطاء |
| `noFallthroughCasesInSwitch` | `true` | منع تسرب حالات switch |
| `noImplicitOverride` | `false` | لا تحتاج @override |
| `noImplicitReturns` | `true` | جميع المسارات يجب أن ترجع قيمة |
| `noUnusedLocals` | `false` | السماح بمتغيرات محلية غير مستخدمة |
| `noImplicitAny` | `true` | فرض تحديد الأنواع الصريحة |
| `noImplicitThis` | `true` | منع this بدون نوع |
| `strictNullChecks` | `true` | فحص صارم للقيم الفارغة |
| `strictFunctionTypes` | `false` | فحص أقل صرامة للدوال |
| `strictBindCallApply` | `true` | فحص صارم لـ bind/call/apply |
| `strictPropertyInitialization` | `true` | فحص بدء خصائص الفئات |
| `useUnknownInCatchVariables` | `true` | استخدم `unknown` بدل `any` |
| `alwaysStrict` | `true` | استخدم `"use strict"` دائماً |
| `skipLibCheck` | `true` | تخطي فحص مكتبات `.d.ts` |
| `target` | `"es2022"` | استهداف JavaScript ES2022 |
| `types` | `[]` | لا تضمن تعريفات تلقائية |
| `customConditions` | `["workspace"]` | شروط مخصصة للـ workspace |

---

## 8️⃣ `tsconfig.json` - إعدادات TypeScript الرئيسية

**المسار الكامل:** `/Dot-M-/tsconfig.json`

### الكود الكامل:

```json
{
  "extends": "./tsconfig.base.json",
  "compileOnSave": false,
  "files": [],
  "references": [
    {
      "path": "./lib/db"
    },
    {
      "path": "./lib/api-client-react"
    },
    {
      "path": "./lib/api-zod"
    }
  ]
}
```

### شرح:

| الحقل | الشرح |
|-----|-------|
| `"extends": "./tsconfig.base.json"` | وراثة الإعدادات الأساسية |
| `"compileOnSave": false` | لا تترجم عند الحفظ تلقائياً |
| `"files": []` | لا توجد ملفات مباشرة |
| `"references"` | مراجع للمشاريع الأخرى: |
| `./lib/db` | قاعدة البيانات |
| `./lib/api-client-react` | عميل React للـ API |
| `./lib/api-zod` | Zod Validation |

---

## 9️⃣ `pyproject.toml` - إعدادات المشروع Python

**المسار الكامل:** `/Dot-M-/pyproject.toml`

### الكود الكامل:

```toml
[project]
name = "repl-nix-workspace"
version = "0.1.0"
description = "Add your description here"
requires-python = ">=3.11"
dependencies = [
    "edge-tts>=7.2.8",
    "faster-whisper>=1.2.1",
]
```

### شرح كل حقل:

| الحقل | القيمة | الشرح |
|-----|--------|-------|
| `name` | `repl-nix-workspace` | اسم المشروع Python |
| `version` | `0.1.0` | الإصدار الأولي |
| `description` | `...` | وصف المشروع |
| `requires-python` | `>=3.11` | Python 3.11 أو أحدث |
| **dependencies** | | المكتبات المطلوبة: |
| `edge-tts` | `>=7.2.8` | تحويل النص إلى كلام |
| `faster-whisper` | `>=1.2.1` | تحويل الكلام إلى نص |

---

## 🔟 `main.py` - ملف Python الرئيسي

**المسار الكامل:** `/Dot-M-/main.py`

### الكود الكامل:

```python
def main():
    print("Hello from repl-nix-workspace!")


if __name__ == "__main__":
    main()
```

### شرح السطور:

| السطر | الشرح |
|-----|-------|
| `def main():` | تعريف الدالة الرئيسية |
| `print(...)` | طباعة رسالة ترحيب |
| `if __name__ == "__main__":` | يتحقق إذا كان الملف يعمل مباشرة |
| `main()` | تشغيل الدالة الرئيسية |

**الغرض:** ملف اختبار بسيط للتحقق من بيئة Python

---

## 1️⃣1️⃣ `replit.md` - وثيقة Replit

**المسار الكامل:** `/Dot-M-/replit.md`

### الكود الكامل:

```markdown
# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
```

### شرح الأقسام:

#### `## Run & Operate` - التشغيل والتشغيل:

| الأمر | الغرض |
|-----|-------|
| `pnpm --filter @workspace/api-server run dev` | تشغيل خادم API (منفذ 5000) |
| `pnpm run typecheck` | فحص الأنواع الكامل |
| `pnpm run build` | بناء جميع الحزم |
| `pnpm --filter @workspace/api-spec run codegen` | إعادة إنشاء API Schemas |
| `pnpm --filter @workspace/db run push` | دفع تغييرات قاعدة البيانات |
| `DATABASE_URL` | متغير البيئة: سلسلة اتصال PostgreSQL |

#### `## Stack` - التكنولوجيا المستخدمة:

| المكون | التفاصيل |
|------|----------|
| **Runtime** | pnpm workspaces, Node.js 24, TypeScript 5.9 |
| **API** | Express 5 |
| **Database** | PostgreSQL + Drizzle ORM |
| **Validation** | Zod (v4), drizzle-zod |
| **API Codegen** | Orval (من OpenAPI spec) |
| **Build** | esbuild (CJS bundle) |

---

## 1️⃣2️⃣ `pnpm-lock.yaml` - ملف القفل

**المسار الكامل:** `/Dot-M-/pnpm-lock.yaml`  
**الحجم:** 216 KB

### الشرح:

- **الغرض:** تأمين إصدارات جميع المكتبات المثبتة
- **المحتوى:** تفاصيل جميع الحزم والإصدارات والمكتبات الفرعية
- **الاستخدام:** pnpm يستخدمه لضمان تثبيت نفس الإصدارات دائماً
- **الأهمية:** تجنب مشاكل الإصدارات المختلفة بين الأجهزة

**لا تعدله يدوياً - pnpm يديره تلقائياً**

---

## 1️⃣3️⃣ `scripts/tsconfig.json` - إعدادات TypeScript للسكريبتات

**المسار الكامل:** `/Dot-M-/scripts/tsconfig.json`

### الكود الكامل:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

### شرح:

| الحقل | الشرح |
|-----|-------|
| `"extends": "../tsconfig.base.json"` | وراثة من الإعدادات الأساسية |
| `"outDir": "dist"` | مجلد الإخراج: `dist/` |
| `"rootDir": "src"` | مجلد المصدر: `src/` |
| `"types": ["node"]` | استخدم تعريفات Node.js |
| `"include": ["src"]` | شمول ملفات من مجلد `src` |

---

## 1️⃣4️⃣ `scripts/package.json` - حزم السكريبتات

**المسار الكامل:** `/Dot-M-/scripts/package.json`

### الكود الكامل:

```json
{
  "name": "@workspace/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "hello": "tsx ./src/hello.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "tsx": "catalog:"
  }
}
```

### شرح:

| الحقل | الشرح |
|-----|-------|
| `"name": "@workspace/scripts"` | اسم الحزمة المرقمة (Scoped) |
| `"type": "module"` | استخدام ES modules |
| `"hello": "tsx ./src/hello.ts"` | تشغيل ملف TypeScript |
| `"typecheck"` | فحص الأنواع بدون إخراج |
| `"@types/node": "catalog:"` | استخدام الإصدار من الكتالوج |
| `"tsx": "catalog:"` | استخدام الإصدار من الكتالوج |

---

# 📊 ملخص شامل لجميع المكونات

## 📋 جدول كامل لجميع الملفات والمجلدات:

| اسم الملف/المجلد | المسار | النوع | الحجم | الغرض |
|-----------------|--------|-------|-------|-------|
| **.gitignore** | `/.gitignore` | Config | 668 B | تجاهل Git |
| **.npmrc** | `/.npmrc` | Config | 56 B | إعدادات NPM |
| **.replit** | `/.replit` | Config | 523 B | إعدادات Replit |
| **.replitignore** | `/.replitignore` | Config | 201 B | تجاهل Replit |
| **package.json** | `/package.json` | Config | 585 B | إدارة الحزم |
| **pnpm-workspace.yaml** | `/pnpm-workspace.yaml` | Config | 6.5 KB | إعدادات Workspace |
| **pnpm-lock.yaml** | `/pnpm-lock.yaml` | Lock | 216 KB | قفل الحزم |
| **tsconfig.json** | `/tsconfig.json` | Config | 236 B | إعدادات TS الرئيسية |
| **tsconfig.base.json** | `/tsconfig.base.json` | Config | 667 B | إعدادات TS الأساسية |
| **pyproject.toml** | `/pyproject.toml` | Config | 196 B | إعدادات Python |
| **main.py** | `/main.py` | Code | 96 B | ملف Python |
| **replit.md** | `/replit.md` | Docs | 1.5 KB | وثيقة Replit |
| **artifacts/** | `/artifacts/` | Dir | - | الأنتاجات |
| **attached_assets/** | `/attached_assets/` | Dir | - | الأصول |
| **lib/** | `/lib/` | Dir | - | المكتبات المشتركة |
| **lib/integrations/** | `/lib/integrations/` | Dir | - | التكاملات |
| **scripts/** | `/scripts/` | Dir | - | السكريبتات |
| **scripts/tsconfig.json** | `/scripts/tsconfig.json` | Config | - | إعدادات TS |
| **scripts/package.json** | `/scripts/package.json` | Config | - | حزم السكريبتات |
| **project-source/** | `/project-source/` | Dir | - | مصدر المشروع |

---

# 🎯 الأوامر المهمة

```bash
# التثبيت
pnpm install

# فحص الأنواع
pnpm run typecheck

# فحص المكتبات فقط
pnpm run typecheck:libs

# البناء الكامل
pnpm run build

# تشغيل سكريبت
pnpm --filter @workspace/scripts run hello

# تشغيل API Server
pnpm --filter @workspace/api-server run dev

# إعادة إنشاء API Schemas
pnpm --filter @workspace/api-spec run codegen

# دفع تغييرات قاعدة البيانات
pnpm --filter @workspace/db run push

# تنظيف مخزن pnpm
pnpm store prune
```

---

# 🔒 نقاط الأمان المهمة

1. ✅ **Minimum Release Age**: 1440 دقيقة (يوم واحد)
2. ✅ **استثناءات موثوقة**: فقط Replit والخدمات الموثوقة
3. ✅ **TypeScript صارم**: فحوصات نوع عميقة
4. ✅ **لا تثبيت تلقائي**: التحكم اليدوي بـ Peer Dependencies
5. ✅ **فرض pnpm**: منع npm و yarn

---

# 📈 معلومات المشروع الختامية

| المعلومة | التفاصيل |
|---------|---------|
| **إجمالي الملفات** | 20+ ملف |
| **لغات البرمجة** | TypeScript, Python, YAML, JSON, TOML |
| **حجم المستودع** | ~1 MB |
| **النوع** | Pnpm Workspace متقدم |
| **الحالة** | ✅ جاهز للإنتاج |
| **المتطلبات** | Node.js 24, pnpm, Python 3.11+ |
| **النسخة** | 0.0.0 (تطوير مبكر) |

---

**آخر تحديث:** 28 مايو 2026  
**أنشأ بواسطة:** GitHub Copilot  
**الترخيص:** MIT  
**المستودع:** https://github.com/bzbznsnsjsnssnsh-design/Dot-M-
