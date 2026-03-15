# Lab Notebook

## 프로젝트 개요
MOF/COF 등 reticular material 연구자를 위한 개인 디지털 연구노트 웹앱.
React + Vite + Tailwind CSS로 구현. Google Drive에 데이터 저장. Vercel 배포.

## 기술 스택
- 프레임워크: React + Vite
- 스타일링: Tailwind CSS
- 에디터: Tiptap
- 그래프 뷰: React Flow
- 저장소: Google Drive API
- 인증: Google OAuth 2.0
- 배포: Vercel
- DOI 조회: CrossRef API (무료, 인증 불필요)

## 폴더 구조
src/
  pages/          # 각 메뉴 페이지
  components/     # 재사용 UI 컴포넌트
  features/
    dashboard/    # 대시보드
    experiment/   # 실험 노트 (핵심)
    graph/        # 연결 그래프 (React Flow)
    calendar/     # 캘린더
    browser/      # 데이터 브라우저
    reference/    # 문헌 관리
    tips/         # 랩 노하우
  services/
    drive/        # Google Drive API 연동
    auth/         # Google OAuth
    crossref/     # CrossRef API (DOI 자동조회)
  store/          # 전역 상태 관리
  schema/         # JSON 스키마 정의
  utils/          # 공통 유틸 함수

## 앱 메뉴 구조
1단계: 대시보드, 실험 노트, 설정
2단계: 캘린더, 문헌 관리, 랩 노하우, 데이터 브라우저
3단계: 연결 그래프

## JSON 스키마

### 실험 엔트리 (experiment)
{
  "id": "exp_250301_001",
  "projectId": "proj_001",
  "title": "",
  "createdAt": "",
  "dataReceivedAt": "",
  "status": "in_progress",
  "outcome": "unknown",
  "goal": "",
  "tags": [],
  "procedure": {
    "common": {},
    "conditionTable": {},
    "observations": {}
  },
  "dataBlocks": [
    {
      "id": "block_001",
      "groupLabel": "",
      "items": [
        {
          "id": "item_001",
          "analysisType": "PXRD",
          "driveFileId": "",
          "thumbnailUrl": "",
          "caption": ""
        }
      ],
      "interpretation": {}
    }
  ],
  "conclusion": {},
  "connections": {
    "precedingExperiments": [],
    "followingExperiments": [],
    "references": []
  }
}

### 문헌 (reference)
{
  "id": "ref_001",
  "doi": "",
  "shortCitation": "저널, 연도, vol, issue(있을때만), pages",
  "title": "",
  "authors": "",
  "journal": "",
  "year": null,
  "volume": null,
  "issue": null,
  "pages": "",
  "notes": {},
  "citedIn": []
}

### 랩 노하우 (tip)
{
  "id": "tip_001",
  "title": "",
  "createdAt": "",
  "content": {}
}

### 프로젝트 (project)
{
  "id": "proj_001",
  "title": "",
  "createdAt": "",
  "members": [],
  "sharedDriveFolderId": null
}

### 캘린더 계획 (plan)
{
  "id": "plan_001",
  "date": "",
  "title": "",
  "linkedExperimentId": null,
  "note": ""
}

### 앱 설정 (settings)
{
  "theme": "system",
  "language": "ko",
  "dateFormat": "YYYY-MM-DD",
  "alarm": {
    "enabled": true,
    "time": "18:00"
  },
  "drive": {
    "rootFolderId": "",
    "connectedEmail": ""
  },
  "allowedAccounts": []
}

## 분석 종류 기본값
PXRD, IR, NMR, OM, SEM, Photo, BET (사용자 추가 가능)

## status 자동 전환 규칙
- 엔트리 생성 직후 → in_progress
- 실험 과정 작성 완료 + 데이터 없음 → data_pending
- 데이터 일부 추가됨 → analyzing
- completed 전환은 항상 수동 (자동 전환 없음)
- 사용자가 언제든 수동 override 가능

## outcome 규칙
- 기본값: unknown
- completed 전환 시 outcome 선택 팝업 표시
- 선택지: success / failed / partial / unknown
- 이후에도 수동 변경 가능

## 연결 그래프 노드 색상 규칙
- completed + success  → 초록
- completed + failed   → 빨강
- completed + partial  → 주황
- completed + unknown  → 회색
- 그 외 모든 status   → 흰색 배경 + 상태 텍스트 표시
  - in_progress  → "진행중"
  - data_pending → "데이터 대기"
  - analyzing    → "분석중"

## 연결 그래프 인터랙션
- 노드 클릭 → 해당 실험 노트 사이드패널로 열람
- 노드 우클릭 메뉴:
  1. 실험 노트 열기
  2. 완료로 전환 → outcome 선택 팝업
  3. outcome 변경 → outcome 선택 팝업
- 연결 관계 지정: 실험 노트 하단 "연결 관계" 섹션에서 검색으로 선행 실험 선택
- 후속 실험은 자동 역참조
- 그래프 뷰에서도 드래그로 연결 추가 가능

## 문헌 처리
- DOI 입력 시 CrossRef API로 자동 조회
- 표시 형식: 저널, 연도, vol, issue(있을 때만), pages
- DOI 클릭 시 https://doi.org/DOI 링크로 열림

## 이미지 처리
- PPT/클립보드 붙여넣기 지원
- 그룹 내 이미지 높이 통일 (가로는 비율 유지)
- 개별 리사이즈 가능 (가로 드래그)
- 클릭 시 원본 크기 팝업
- 분석 종류 라벨 태그 필수

## 공유 및 내보내기
- 실험 방법 export: .labnote 파일 (JSON 기반, 사용자에게는 앱 전용 파일로 표시)
- import: 파일 선택 또는 Drive 링크
- 공동 작업: Drive 공유 폴더 방식

## 설정 메뉴 항목
- 앱 설정: 색상 테마(라이트/다크/시스템), 언어, 날짜 형식
- 알람: on/off, 시각 지정
- 데이터: Drive 연동 계정/폴더, 백업 주기, 전체 export
- 계정/접근: 허용 Google 계정 목록, 공동작업 프로젝트 관리

## 개발 원칙
- 각 feature 폴더는 독립적. 다른 feature 코드 직접 수정 없이 기능 추가/제거 가능
- services/drive, services/auth는 코어. 변경 시 전체 영향 고려
- 사용자가 JSON을 직접 다루는 일 없도록 모든 입출력은 UI로 처리
- API 키와 OAuth 클라이언트 ID는 반드시 .env 파일에 저장. 코드에 직접 입력 금지
- .env는 .gitignore에 포함. GitHub에 절대 올라가지 않도록
- 모바일 반응형 레이아웃 유지

## 공동 작업
- Drive 공유 폴더 방식으로 특정 프로젝트 공동 작성 가능
- Drive 권한을 앱이 자동으로 변경하는 방식 사용 안 함
- 향후 구현 예정

## Export/Import
- 형식: .labnote (내부는 JSON, 사용자에게는 앱 전용 파일로 표시)
- Export: 실험 과정·조건표·메타 정보만 포함 (이미지 제외)
- Import: 파일 선택으로 불러오기
- Drive 권한 자동 변경 방식 사용 안 함

## 데이터 브라우저 상세
- 분석 라벨 기준 필터링 + 시계열/인과 순서 정렬
- 행 구성: 분석종류 · 날짜 · 실험번호 · 실험제목
- 같은 실험의 동일 라벨 이미지는 묶어서 표시 (썸네일)
- 클릭 시 해당 실험 노트 상세로 진입

## 선행 실험 사이드패널
- 실험 노트 상세에서 선행 실험 클릭 시
- 현재 창을 벗어나지 않고 사이드패널로 해당 실험 내용 열람 가능

## DOI 자동조회
- CrossRef API 사용 (무료, 인증 불필요)
- 인용 형식: 저널, 연도, vol, issue(있을 때만), pages
- DOI 클릭 시 https://doi.org/DOI 링크로 열림
- 실험 노트 상세 내 축약 인용 형식으로 표시

## 이미지 처리 상세
- PPT/클립보드 붙여넣기 지원
- 그룹 내 이미지 높이 통일 (가로는 원본 비율 유지)
- 개별 리사이즈 가능 (가로 드래그, 높이는 비율 따라감)
- 클릭 시 원본 크기 팝업
- 그룹 내 높이 동일하게 / 원본 비율 각자 토글 가능
- 분석 종류 라벨 태그 필수

## 보안 원칙
- Google OAuth implicit flow 사용 (CLIENT_SECRET 불필요)
- access token은 메모리(store)에만 저장
- localStorage에 민감 정보 저장 금지
- API 키는 .env에만 저장, 코드에 직접 입력 금지
- .env는 .gitignore에 포함

## 프린트 기능 (4단계 편의 기능)
- A4 용지 기준 반절씩 구성
- 상단 반절: 실험 계획 (연구 목표 + 실험 과정 + 조건비교표)
- 하단 반절: 데이터 및 결과 (이미지 + 해석 + 결론 + 후속계획)
- 프린트 옵션: 상단만 / 하단만 / 전체 선택 가능
- 구현 방식: CSS @media print (별도 라이브러리 불필요)
- 각 섹션에 프린트용 CSS 클래스 미리 지정해둘 것
