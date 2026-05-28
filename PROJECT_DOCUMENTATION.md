# 📋 Dot-M- المشروع الشامل - توثيق المشروع الكامل

> **وثيقة شاملة تشرح جميع مكونات المشروع بالتفصيل مع الكود والشرح**

---

## 📌 نظرة عامة على المشروع

**اسم المشروع:** Dot-M-  
**الوصف:** Repository for https://replit.com/@jsnsheeg/Dot-Master  
**اللغات:** TypeScript (95.3%), CSS (2%), Python (1.2%), Other (1.5%)  
**النوع:** مشروع Pnpm Workspace - مشروع متعدد الحزم

---

## 📁 هيكل المشروع الكامل

```
Dot-M-/
├── 📄 package.json                 # ملف إدارة الحزم الرئيسي
├── 📄 pnpm-workspace.yaml          # إعدادات workspace و المكتبات
├── 📄 tsconfig.json                # إعدادات TypeScript الرئيسية
├── 📄 tsconfig.base.json           # الإعدادات الأساسية لـ TypeScript
├── 📄 main.py                      # ملف Python الرئيسي
├── 📄 replit.md                    # وثيقة Replit للمشروع
├── 📄 .gitignore                   # ملف تجاهل Git
├── 📄 .npmrc                       # إعدادات npm
├── 📄 .replit                      # إعدادات Replit
├── 📄 .replitignore                # ملف تجاهل Replit
├── 📄 pyproject.toml               # إعدادات Python
├── 📄 pnpm-lock.yaml               # ملف التثبيت المقفول
├── 📁 artifacts/                   # مجلد الأنتاجات
├── 📁 attached_assets/             # مجلد الأصول المرفقة
├── 📁 lib/                         # مكتبة الكود المشترك
├── 📁 lib/integrations/            # التكاملات
├── 📁 scripts/                     # سكريبتات المشروع
└── 📁 project-source/              # مصدر المشروع

```

---

## 🔧 المكونات الرئيسية للمشروع

### 1️⃣ **package.json** (الملف الرئيسي لإدارة الحزم)
**المسار:** `/package.json`

**الكود:**
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

**الشرح:**
- **name**: اسم مساحة العمل الرئيسية
- **version**: إصدار المشروع (0.0.0)
- **license**: ترخيص MIT - مفتوح المصدر
- **scripts**: أوامر npm:
  - `preinstall`: يفرض استخدام pnpm فقط ويمنع npm و yarn
  - `build`: ينفذ typecheck ثم يبني جميع الحزم
  - `typecheck:libs`: فحص الأنواع في المكتبات
  - `typecheck`: فحص الأنواع الكامل
- **devDependencies**: 
  - `prettier`: أداة تنسيق الكود
  - `typescript`: مترجم TypeScript

---

### 2️⃣ **pnpm-workspace.yaml** (إعدادات مساحة العمل)
**المسار:** `/pnpm-workspace.yaml`

**الكود:**
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
```

**الشرح:**
- **minimumReleaseAge**: حماية أمان - لا تثبت حزم جديدة إلا بعد 1440 دقيقة (يوم واحد)
- **minimumReleaseAgeExclude**: استثناءات من الحد الأدنى (حزم موثوقة من Replit)
- **packages**: قائمة مسارات الحزم الجزئية في Workspace
- **catalog**: كتالوج المكتبات المشتركة والإصدارات المتفق عليها
- **autoInstallPeers**: لا تثبت المكتبات المعتمد عليها تلقائياً
- **onlyBuiltDependencies**: المكتبات التي تحتاج إلى بناء خاص

---

### 3️⃣ **tsconfig.base.json** (إعدادات TypeScript الأساسية)
**المسار:** `/tsconfig.base.json`

**الكود:**
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

**الشرح:**
- **isolatedModules**: معاملة كل ملف كوحدة مستقلة
- **lib**: استخدم مكتبات ES2022
- **module**: نوع الوحدات ES جديد
- **strictNullChecks**: فحص صارم للقيم الفارغة
- **target**: استهداف JavaScript ES2022
- **customConditions**: شرط مخصص لـ workspace

---

### 4️⃣ **main.py** (ملف Python الرئيسي)
**المسار:** `/main.py`

**الكود:**
```python
def main():
    print("Hello from repl-nix-workspace!")


if __name__ == "__main__":
    main()
```

**الشرح:**
- **main()**: دالة رئيسية تطبع رسالة ترحيب
- **if __name__ == "__main__"**: يتحقق من أن الملف يعمل مباشرة (وليس مستورد)
- **الغرض**: ملف بسيط لاختبار بيئة Python في Replit

---

### 5️⃣ **replit.md** (وثيقة Replit)
**المسار:** `/replit.md`

**الكود:**
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

**الشرح:**
- توثيق شاملة للمشروع عند نشره على Replit
- تحتوي على أوامر التشغيل والبناء
- توضح الـ Stack التكنولوجي المستخدم
- توفر إرشادات للتطوير والتشغيل

---

## 🔐 ملفات الإعدادات الأمنية والإدارة

### **.npmrc** - إعدادات npm
**المسار:** `/.npmrc`
- يحتوي على إعدادات npm للمشروع

### **.replit** - إعدادات Replit
**المسار:** `/.replit`
- إعدادات بيئة Replit

### **.replitignore** - تجاهل الملفات في Replit
**المسار:** `/.replitignore`
- ملفات يتم تجاهلها عند التحديث على Replit

### **.gitignore** - تجاهل Git
**المسار:** `/.gitignore`
- ملفات يتم تجاهلها في Git

### **pyproject.toml** - إعدادات Python
**المسار:** `/pyproject.toml`
- إعدادات المشروع Python

---

## 📦 المجلدات الرئيسية

| المجلد | الغرض |
|-------|-------|
| **artifacts/** | يحتوي على أنتاجات البناء والأنتاجات النهائية |
| **attached_assets/** | الأصول المرفقة والموارد |
| **lib/** | المكتبات المشتركة والكود المعاد استخدامه |
| **lib/integrations/** | التكاملات مع الخدمات الخارجية |
| **scripts/** | سكريبتات المشروع والأتمتة |
| **project-source/** | مصدر المشروع الأساسي |

---

## 🛠️ المكتبات الرئيسية المستخدمة

### Frontend
- **React 19.1.0**: مكتبة بناء الواجهات
- **Vite 7.3.2**: أداة البناء والتطوير
- **Tailwind CSS 4.1.14**: إطار عمل CSS
- **Framer Motion 12.23.24**: مكتبة الرسوم المتحركة

### Backend & Data
- **Express 5**: إطار عمل API
- **PostgreSQL + Drizzle ORM**: قاعدة البيانات والـ ORM
- **Zod 3.25.76**: مكتبة التحقق من البيانات

### Tools
- **TypeScript 5.9.3**: لغة البرمجة الأساسية
- **pnpm**: مدير الحزم
- **Prettier**: أداة تنسيق الكود
- **esbuild**: أداة البناء السريعة

---

## 🚀 الأوامر الأساسية

```bash
# التثبيت
pnpm install

# فحص الأنواع
pnpm run typecheck

# البناء الكامل
pnpm run build

# تشغيل API Server
pnpm --filter @workspace/api-server run dev

# إعادة إنشاء API Schemas
pnpm --filter @workspace/api-spec run codegen

# دفع تغييرات قاعدة البيانات
pnpm --filter @workspace/db run push
```

---

## 📋 ملخص المكونات

| المكون | النوع | الوصف |
|-------|------|-------|
| package.json | Config | إدارة الحزم والنصوص |
| pnpm-workspace.yaml | Config | إعدادات Workspace والمكتبات |
| tsconfig.base.json | Config | إعدادات TypeScript |
| tsconfig.json | Config | إعدادات TypeScript الرئيسية |
| main.py | Code | ملف Python بسيط للاختبار |
| replit.md | Docs | وثيقة Replit |
| .npmrc | Config | إعدادات npm |
| .replit | Config | إعدادات Replit |
| .replitignore | Config | تجاهل Replit |
| .gitignore | Config | تجاهل Git |
| pyproject.toml | Config | إعدادات Python |
| pnpm-lock.yaml | Lock | ملف التثبيت المقفول |

---

## 🔒 نقاط الأمان المهمة

1. **Minimum Release Age**: 1440 دقيقة (يوم واحد) - حماية من هجمات Supply Chain
2. **استثناءات موثوقة**: فقط حزم Replit والموثوقة
3. **صارم TypeScript**: فحوصات نوع صارمة لتقليل الأخطاء
4. **Peer Dependencies**: لا تثبت تلقائياً لتجنب النزاعات

---

## 📝 الخلاصة

المشروع **Dot-M-** هو مشروع **Pnpm Workspace** متطور يجمع بين:
- ✅ **TypeScript** للأمان والأداء
- ✅ **React + Vite** للواجهة الأمامية
- ✅ **Express + PostgreSQL** للخلفية
- ✅ **Drizzle ORM** لإدارة قاعدة البيانات
- ✅ **Tailwind CSS** للتصميم
- ✅ **Pnpm Workspaces** لإدارة الحزم المتعددة

المشروع مجهز للتطوير الاحترافي والإنتاج مع أفضل الممارسات الأمنية والتقنية.

---

**آخر تحديث:** 28 مايو 2026  
**الحالة:** ✅ نشط ومستمر في التطوير  
**المستودع:** bzbznsnsjsnssnsh-design/Dot-M-
