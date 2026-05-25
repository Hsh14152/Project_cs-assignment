// 프로세스 분류 데이터베이스
const processDatabase = {
  critical: [
    'system',
    'csrss.exe',
    'wininit.exe',
    'services.exe',
    'lsass.exe',
    'svchost.exe',
    'dwm.exe',
    'explorer.exe',
    'winlogon.exe',
    'smss.exe',
    'registry',
    'fontdrvhost.exe',
    'conhost.exe',
  ],
  safe: [
    'chrome.exe',
    'msedge.exe',
    'firefox.exe',
    'notepad.exe',
    'calculator.exe',
    'spotify.exe',
    'discord.exe',
    'slack.exe',
    'teams.exe',
    'zoom.exe',
    'kakao',
    'telegram',
    'steam.exe',
    'epic',
    'origin.exe',
    'code.exe',
    'vlc.exe',
    'notion.exe',
    'obsidian.exe',
  ],
  caution: [
    'antimalware',
    'windows defender',
    'nvidia',
    'amd',
    'intel',
    'runtime broker',
    'backgroundtaskhost.exe',
    'searchindexer.exe',
    'securityhealthservice.exe',
    'audiodg.exe',
  ],
};

let uploadedFile = null;
let analysisResults = null;

// 파일 입력 이벤트
document
  .getElementById('fileInput')
  .addEventListener('change', handleFileSelect);

// 드래그 앤 드롭 이벤트
const uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드 가능합니다.');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('파일 크기는 10MB를 초과할 수 없습니다.');
    return;
  }

  uploadedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('previewImage').src = e.target.result;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('previewSection').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('previewSection').style.display = 'none';
}

async function analyzeImage() {
  if (!uploadedFile) {
    alert('이미지를 먼저 업로드해주세요.');
    return;
  }

  // UI 전환
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';

  // 버튼 비활성화
  document.getElementById('analyzeBtn').disabled = true;

  try {
    // Tesseract.js OCR 실행
    const result = await Tesseract.recognize(
      uploadedFile,
      'eng+kor', // 영어 + 한글 인식
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            updateProgress(progress, '텍스트 인식 중...');
          }
        },
      },
    );

    updateProgress(100, '분석 완료!');

    // OCR 결과에서 프로세스 정보 추출
    const processes = parseOCRText(result.data.text);

    if (processes.length === 0) {
      showError(
        '프로세스 정보를 찾을 수 없습니다. 더 선명한 이미지로 다시 시도해주세요.',
      );
      return;
    }

    analysisResults = processes;
    displayResults(analysisResults);
  } catch (error) {
    console.error('OCR 에러:', error);
    showError('이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.');
  } finally {
    document.getElementById('analyzeBtn').disabled = false;
  }
}

function updateProgress(percentage, message) {
  document.getElementById('progressBar').style.width = percentage + '%';
  document.getElementById('progressText').textContent = percentage + '%';
  document.getElementById('loadingSubtext').textContent = message;
}

function parseOCRText(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  const processes = [];

  console.log('OCR 원본 텍스트:', text);

  // 다양한 패턴 매칭
  const patterns = [
    // 프로세스명.exe 1,234 MB
    /([a-zA-Z0-9가-힣._-]+\.exe)\s+([\d,]+)\s*(MB|KB|GB|M|K|G)/gi,
    // 프로세스명 1,234 MB
    /([a-zA-Z0-9가-힣._-]+)\s+([\d,]+)\s*(MB|KB|GB|M|K|G)/gi,
    // 프로세스명: 1234MB
    /([a-zA-Z0-9가-힣._-]+)[:\s]+([\d,]+)\s*(MB|KB|GB|M|K|G)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      let memory = parseFloat(match[2].replace(/,/g, ''));
      const unit = match[3].toUpperCase();

      // 단위 변환 (MB 기준)
      if (unit.startsWith('K')) {
        memory = memory / 1024;
      } else if (unit.startsWith('G')) {
        memory = memory * 1024;
      }

      // 중복 제거
      if (!processes.find((p) => p.name === name) && memory > 0) {
        const category = categorizeProcess(name);
        processes.push({
          name: name,
          memory: memory,
          category: category,
          description: getProcessDescription(name, category),
        });
      }
    }
  }

  console.log('파싱된 프로세스:', processes);
  return processes;
}

function categorizeProcess(name) {
  const lowerName = name.toLowerCase();

  for (const critical of processDatabase.critical) {
    if (lowerName.includes(critical.toLowerCase())) {
      return 'critical';
    }
  }

  for (const safe of processDatabase.safe) {
    if (lowerName.includes(safe.toLowerCase())) {
      return 'safe';
    }
  }

  for (const caution of processDatabase.caution) {
    if (lowerName.includes(caution.toLowerCase())) {
      return 'caution';
    }
  }

  return 'caution';
}

function getProcessDescription(name, category) {
  const lowerName = name.toLowerCase();

  if (category === 'critical') {
    if (lowerName.includes('system')) {
      return 'Windows 커널 프로세스 - 절대 종료 불가';
    } else if (lowerName.includes('explorer')) {
      return 'Windows 탐색기 - 종료 시 화면이 사라짐';
    } else if (lowerName.includes('dwm')) {
      return '화면 관리자 - 종료 시 화면 표시 오류';
    }
    return '시스템 필수 프로세스 - 종료하면 안됨';
  } else if (category === 'safe') {
    if (
      lowerName.includes('chrome') ||
      lowerName.includes('edge') ||
      lowerName.includes('firefox')
    ) {
      return '웹 브라우저 - 안전하게 종료 가능';
    } else if (
      lowerName.includes('discord') ||
      lowerName.includes('kakao') ||
      lowerName.includes('telegram')
    ) {
      return '메신저 앱 - 안전하게 종료 가능';
    } else if (lowerName.includes('code') || lowerName.includes('notepad')) {
      return '개발 도구 / 편집기 - 안전하게 종료 가능';
    }
    return '일반 응용 프로그램 - 안전하게 종료 가능';
  } else {
    if (lowerName.includes('runtime') || lowerName.includes('broker')) {
      return 'Windows 시스템 서비스 - 확인 후 종료';
    } else if (lowerName.includes('nvidia') || lowerName.includes('amd')) {
      return '그래픽 드라이버 - 게임/영상 작업 시 필요';
    }
    return '시스템 서비스 - 용도 확인 후 종료';
  }
}

function displayResults(processes) {
  const statsDiv = document.getElementById('stats');
  const processListDiv = document.getElementById('processList');

  const safeProcesses = processes.filter((p) => p.category === 'safe');
  const criticalProcesses = processes.filter((p) => p.category === 'critical');
  const cautionProcesses = processes.filter((p) => p.category === 'caution');

  const totalMemory = processes.reduce((sum, p) => sum + p.memory, 0);
  const safeMemory = safeProcesses.reduce((sum, p) => sum + p.memory, 0);

  statsDiv.innerHTML = `
        <div class="stat-card">
            <h3>전체 프로세스</h3>
            <div class="value">${processes.length}</div>
        </div>
        <div class="stat-card safe">
            <h3>안전하게 종료 가능</h3>
            <div class="value">${safeProcesses.length}</div>
        </div>
        <div class="stat-card warning">
            <h3>확보 가능한 메모리</h3>
            <div class="value">${safeMemory.toFixed(0)} MB</div>
        </div>
    `;

  let listHTML = '';

  if (safeProcesses.length > 0) {
    listHTML += generateCategoryHTML(
      'safe',
      safeProcesses,
      '✅ 안전하게 종료 가능한 프로세스',
    );
  }

  if (cautionProcesses.length > 0) {
    listHTML += generateCategoryHTML(
      'caution',
      cautionProcesses,
      '⚠️ 확인 후 종료 권장',
    );
  }

  if (criticalProcesses.length > 0) {
    listHTML += generateCategoryHTML(
      'critical',
      criticalProcesses,
      '⛔ 종료하면 안되는 시스템 프로세스',
    );
  }

  processListDiv.innerHTML = listHTML;

  document.getElementById('loadingSection').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  document
    .getElementById('results')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function generateCategoryHTML(category, processes, title) {
  const statusClass =
    category === 'safe'
      ? 'status-safe'
      : category === 'caution'
        ? 'status-caution'
        : 'status-critical';
  const statusText =
    category === 'safe'
      ? '종료 가능'
      : category === 'caution'
        ? '주의 필요'
        : '종료 금지';

  const sortedProcesses = processes.sort((a, b) => b.memory - a.memory);

  return `
        <div class="process-category">
            <div class="category-header ${category}">
                ${title} (${processes.length}개)
            </div>
            ${sortedProcesses
              .map(
                (p) => `
                <div class="process-item">
                    <div class="process-info">
                        <div class="process-name">${p.name}</div>
                        <div class="process-memory">메모리 사용량: ${p.memory.toFixed(1)} MB</div>
                        <div class="process-description">${p.description}</div>
                    </div>
                    <span class="process-status ${statusClass}">${statusText}</span>
                </div>
            `,
              )
              .join('')}
        </div>
    `;
}

function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('loadingSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'block';
}

function exportReport() {
  if (!analysisResults) return;

  const safeProcesses = analysisResults.filter((p) => p.category === 'safe');
  const safeMemory = safeProcesses.reduce((sum, p) => sum + p.memory, 0);

  let report = '프로세스 분석 보고서\n';
  report += '='.repeat(50) + '\n\n';
  report += `총 프로세스 수: ${analysisResults.length}개\n`;
  report += `안전하게 종료 가능: ${safeProcesses.length}개\n`;
  report += `확보 가능한 메모리: ${safeMemory.toFixed(1)} MB\n\n`;

  report += '안전하게 종료 가능한 프로세스:\n';
  report += '-'.repeat(50) + '\n';
  safeProcesses.forEach((p) => {
    report += `${p.name} - ${p.memory.toFixed(1)} MB\n`;
  });

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'process_analysis_report.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function resetAnalysis() {
  analysisResults = null;
  removeImage();
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  document.getElementById('loadingSection').style.display = 'none';
}
