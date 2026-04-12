# Gara — Tab Manager

Chrome Extension (Manifest V3) — 탭을 모으고, 도메인별로 그룹화하고, 프로필로 저장/복원하는 확장 프로그램.

## 기능

- **탭 모으기** — 여러 창에 흩어진 탭을 현재 창으로 모음 (시크릿/고정 탭 제외)
- **도메인별 그룹화** — 같은 도메인 탭을 Chrome 탭 그룹으로 자동 분류
- **프로필 저장/불러오기** — 현재 탭 상태를 프로필로 저장하고 언제든 복원
- **중복 탭 감지/제거** — URL 정규화 기반으로 중복 탭을 찾아 정리
- **프로필 에디터** — 별도 탭에서 그룹/탭을 드래그앤드롭으로 편집 (Undo/Redo 지원)
- **서브도메인 설정** — 병합/분리/커스텀 규칙으로 도메인 처리 방식 선택

## 기술 스택

| 항목 | 도구 |
|------|------|
| 프레임워크 | React 18 + TypeScript |
| 빌드 | Vite + CRXJS |
| 상태 관리 | Zustand |
| 스타일링 | Tailwind CSS |
| 드래그앤드롭 | dnd-kit |

## 프로젝트 구조

```
src/
├── background/        # Service Worker (탭/그룹 조작, 메시지 핸들러)
├── sidepanel/         # Side Panel UI (탭 모으기, 프로필, 중복 감지, 설정)
├── editor/            # 에디터 페이지 (3단 레이아웃, 드래그앤드롭)
├── shared/
│   ├── types/         # 타입 정의
│   ├── store/         # Zustand 스토어 (profile, settings, editor)
│   ├── hooks/         # Chrome API 래핑 훅
│   └── utils/         # 도메인 파싱, 중복 감지, 색상 유틸
└── styles/            # Tailwind CSS
```

## 개발

```bash
# 의존성 설치
npm install

# 개발 서버 (HMR)
npm run dev

# 프로덕션 빌드
npm run build

# 아이콘 생성
node scripts/generate-icons.mjs
```

## Chrome에 로드

1. `npm run build` 실행
2. `chrome://extensions` 접속
3. **개발자 모드** 활성화
4. **압축해제된 확장 프로그램을 로드합니다** → `dist/` 폴더 선택
