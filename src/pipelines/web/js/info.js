/* info.js — "Phương pháp": strategies, terms, tests, methodology. */
function renderInfo() {
  const g = DATA.games.power655;
  const t = (id, title, body) => `<section id="${id}"><h2>${title}</h2>${body}</section>`;
  const dl = (rows) => `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>`;
  document.getElementById("app").innerHTML = `<div class="info">
  <h2 style="margin-top:24px">Phương pháp &amp; giải thích</h2>
  <p>Trang này giải thích cách Vietlott Lab thu thập dữ liệu, các thuật ngữ thống kê, các kiểm định, chiến lược chọn số và cách backtest. Mục tiêu: mọi con số trên dashboard đều kiểm chứng được.</p>
  <nav class="toc">${[["tom-tat", "Tóm tắt"], ["du-lieu", "Dữ liệu"], ["thuat-ngu", "Thuật ngữ"], ["kiem-dinh", "Kiểm định"], ["chien-luoc", "Chiến lược"], ["bo-loc", "Bộ lọc"], ["backtest-pp", "Backtest"], ["gia-tri", "Giá trị kỳ vọng"], ["gioi-han", "Giới hạn"]].map(([id, l]) => `<a href="#info" data-jump="${id}">${l}</a>`).join("")}</nav>

  ${t("tom-tat", "Tóm tắt", `<ul>
    <li>Không sản phẩm nào cho thấy độ lệch có ý nghĩa thống kê so với quay ngẫu nhiên công bằng.</li>
    <li>Không chiến lược chọn số nào thắng chọn ngẫu nhiên trong backtest walk-forward.</li>
    <li>Những thứ thật sự tối ưu được: chọn <b>bậc Keno</b> có tỷ lệ hoàn trả cao nhất, chỉ chơi khi <b>Jackpot vượt mức hòa vốn</b>, và chọn <b>bộ số ít người chọn</b> để giảm khả năng phải chia Jackpot.</li>
  </ul>`)}

  ${t("du-lieu", "Dữ liệu &amp; cập nhật", `<ul>
    <li>Nguồn: kết quả chính thức của Vietlott, crawl bằng mã nguồn mở <a href="https://github.com/vietvudanh/vietlott-data">vietvudanh/vietlott-data</a>.</li>
    <li>Vietlott chặn truy cập từ IP nước ngoài, nên việc crawl chạy trên một máy đặt tại Việt Nam (09:00, 13:30, 22:30). Dữ liệu của repo gốc được gộp thêm làm nguồn dự phòng (01:30). Hai nguồn gộp theo mã kỳ quay, bỏ trùng.</li>
    <li>Power 6/55 có 1 kỳ thiếu số đặc biệt; Mega 6/45 thiếu 197 kỳ đầu ở nguồn gốc; Keno đã loại các kỳ trùng mã.</li>
    <li>Không có lịch sử giá trị Jackpot, nên mọi tính toán dùng Jackpot ở mức tối thiểu (6/55: 30 tỷ và 3 tỷ; 6/45: 12 tỷ; 5/35: 6 tỷ).</li>
  </ul>`)}

  ${t("thuat-ngu", "Thuật ngữ", dl([
    ["Kỳ vọng", "Giá trị trung bình nếu quay ngẫu nhiên công bằng. VD 6/55: mỗi số kỳ vọng xuất hiện 6/55 ≈ 10,9% số kỳ."],
    ["z-score (z)", "Độ lệch so với kỳ vọng tính theo đơn vị độ lệch chuẩn. |z| &lt; 2 là dao động bình thường; với 55 số, luôn có vài số |z| ≈ 2 chỉ do ngẫu nhiên."],
    ["Số nóng / lạnh", "Số có tần suất (trung bình z toàn bộ lịch sử và 150 kỳ gần nhất) thuộc 1/3 cao nhất / thấp nhất."],
    ["Khoảng cách / số kỳ chưa về", "Số kỳ giữa hai lần một số xuất hiện. Nếu ngẫu nhiên, theo phân phối hình học: xác suất về ở kỳ sau không phụ thuộc đã vắng bao lâu."],
    ["Phân phối hình học", "Thời gian chờ đến lần xảy ra đầu tiên của một sự kiện có xác suất p mỗi kỳ. Trung bình 1/p, kỳ chờ ngắn luôn phổ biến nhất."],
    ["Phân phối siêu bội", "Xác suất trùng đúng m số khi chọn k số trong N, với k số trúng — cơ sở tính xác suất giải thưởng và số trùng kỳ vọng."],
    ["p-value", "Xác suất thấy kết quả lệch ít nhất như vậy nếu thực sự không có quy luật. Nhỏ (&lt; 0,05) = bằng chứng có quy luật."],
    ["Bonferroni / Holm", "Hiệu chỉnh khi làm nhiều kiểm định cùng lúc: làm 20 kiểm định thì trung bình 1 cái có p &lt; 0,05 do may mắn. Hiệu chỉnh nhân p-value lên để tránh 'phát hiện' giả."],
    ["Khoảng tin cậy 95% (CI)", "Khoảng giá trị hợp lý cho ước lượng. Nếu CI của lift chứa 0, không thể nói chiến lược khác ngẫu nhiên."],
    ["Lift", "Số trúng trung bình mỗi vé so với chọn ngẫu nhiên, theo %. Lift +1% nghĩa là trung bình trúng nhiều hơn 1% số — vẫn rất nhỏ so với nhiễu."],
    ["ROI", "(Tiền thưởng − chi phí) / chi phí. Một lần trúng Jackpot chi phối ROI, nên ROI không dùng để xếp hạng chiến lược."],
    ["RTP (tỷ lệ hoàn trả)", "Tiền thưởng kỳ vọng trên mỗi đồng mua vé, sau thuế thu nhập 10% phần trên 10 triệu."],
    ["Walk-forward", "Mỗi kỳ chỉ dùng dữ liệu trước kỳ đó để chọn vé, giống như chơi thật. Tránh 'nhìn trước tương lai'."],
    ["Bộ số ít người chọn", "Nhiều người chọn ngày sinh (1–31), số may mắn, dãy liên tiếp. Tránh các mẫu này không tăng xác suất trúng, nhưng nếu trúng Jackpot thì ít khả năng phải chia."],
  ]))}

  ${t("kiem-dinh", "Kiểm định tính ngẫu nhiên", dl([
    ["Tần suất số (chi-square)", "So số lần xuất hiện của từng số với kỳ vọng. Thống kê đã hiệu chỉnh vì các số trong cùng kỳ không lặp lại."],
    ["Tần suất số đặc biệt", "Tương tự cho số đặc biệt (6/55) hoặc số 1–12 (5/35)."],
    ["Lặp lại từ kỳ trước (z-test)", "Số lượng số trùng kỳ ngay trước so với kỳ vọng siêu bội."],
    ["Tự tương quan (lag 1–3)", "Việc một số xuất hiện có làm tăng/giảm khả năng nó xuất hiện 1, 2, 3 kỳ sau không."],
    ["Phân phối khoảng cách", "Khoảng cách giữa các lần xuất hiện có khớp phân phối hình học không."],
    ["Cặp số đi cùng (Monte-Carlo)", "Có cặp số nào xuất hiện cùng nhau nhiều bất thường không; p-value tính bằng 200 lần mô phỏng quay công bằng."],
    ["Tổng các số (KS)", "Phân phối tổng của bộ trúng so với mô phỏng."],
    ["Chẵn/lẻ (chi-square)", "Số lượng số lẻ mỗi kỳ so với phân phối siêu bội."],
  ]) + `<p>Kết luận "Ngẫu nhiên" nghĩa là <i>không phát hiện</i> quy luật với lượng dữ liệu hiện có — đây là kết quả mong đợi với máy quay số được kiểm định.</p>`)}

  ${t("chien-luoc", "Chiến lược chọn số", `<p><b>Mục Gợi ý số</b> (sinh trên trình duyệt, mỗi người xem một bộ riêng mỗi ngày):</p>` + dl([
    ["Nóng", "Lấy mẫu số với trọng số e<sup>z</sup>: số về nhiều hơn kỳ vọng được ưu tiên."],
    ["Lạnh", "Trọng số e<sup>−z</sup>: số về ít hơn kỳ vọng được ưu tiên (ý tưởng 'sắp tới lượt')."],
    ["Ngẫu nhiên", "Mọi số có cơ hội như nhau — mốc so sánh chuẩn."],
    ["Pattern", "Với mỗi kỳ trong lịch sử, ghi lại 'công thức' của bộ trúng so với trạng thái ngay trước đó: bao nhiêu số nóng / lạnh / trung bình, bao nhiêu số lặp kỳ trước, bao nhiêu cặp liền nhau. Vé mới chọn một công thức theo tỷ lệ xuất hiện của nó rồi sinh bộ số khớp công thức."],
    ["Mẫu lạ", "Bộ số có hình dạng bất thường: cấp số cộng, chuỗi liên tiếp, cùng chữ số tận cùng, cùng nhóm 10, bội số, toàn chẵn/lẻ, tổng cực trị, giữ gần hết kỳ trước. Xác suất trúng như mọi bộ khác, nhưng nhiều mẫu này được nhiều người chọn."],
  ]) + `<p><b>Backtest Python</b> (mục Phân tích): Random, Hot, Cold, Not repeat (tránh số vừa về), Exponential decay (tần suất giảm dần theo thời gian), Long absence (số vắng lâu nhất), Markov chain (chuyển tiếp từ kỳ trước), Pair frequency (cặp hay đi cùng), Pattern (gaps) (khoảng cách giữa các số), Unseen pool (bộ chưa từng quay + bộ lọc, 4 nóng/4 lạnh/2 cân bằng).</p>`)}

  ${t("bo-loc", "Bộ lọc tiêu chuẩn", `<ul>
    <li>Luôn loại các bộ đã từng là kết quả.</li>
    <li>Tổng các số nằm trong 80% giữa của phân phối (xấp xỉ chuẩn) — VD 6/55: ${fmt(g.unseen_pool.rules.sum_lo)}–${fmt(g.unseen_pool.rules.sum_hi)}.</li>
    <li>Số lượng số lẻ và số nhỏ thuộc các giá trị phổ biến nhất (tổng xác suất ≥ 80%).</li>
    <li>Khoảng cách lớn nhất giữa hai số liền nhau trong vé ≤ phân vị 95% lịch sử; số cặp liền nhau ≤ phân vị 90%.</li>
  </ul><p>Bộ lọc làm vé trông giống một kỳ quay điển hình. Nó <b>không</b> làm tăng xác suất trúng: mỗi bộ số cụ thể vẫn có xác suất như nhau.</p>`)}

  ${t("backtest-pp", "Phương pháp backtest", `<ul>
    <li>Walk-forward: tại mỗi kỳ, chiến lược chỉ thấy các kỳ trước đó; sau khi chấm vé mới cập nhật dữ liệu.</li>
    <li>Chiến lược và Ngẫu nhiên chạy trên cùng các kỳ, cùng số vé, cùng bộ lọc.</li>
    <li>Chỉ số chính là lift của số trúng trung bình mỗi vé (ổn định hơn ROI). Kiểm định trên trung bình mỗi kỳ vì các vé trong cùng kỳ không độc lập.</li>
    <li>Giải thưởng theo bảng chính thức; Jackpot ở mức tối thiểu; giá vé 10.000đ; 6/55 tính đúng số đặc biệt (Jackpot 2 = 5 số + số đặc biệt).</li>
    <li>Khi thử nhiều chiến lược/tham số/seed, sẽ có lúc thấy kết quả "tốt" do may mắn. Một quy luật thật phải lặp lại trên dữ liệu mới.</li>
  </ul>`)}

  ${t("gia-tri", "Giá trị kỳ vọng", `<ul>
    <li>RTP ở Jackpot tối thiểu (sau thuế): 6/55 ≈ ${pct(DATA.games.power655.value.rtp_min_jackpot)}, 6/45 ≈ ${pct(DATA.games.power645.value.rtp_min_jackpot)}, 5/35 ≈ ${pct(DATA.games.power535.value.rtp_min_jackpot)}.</li>
    <li>Jackpot hòa vốn (chưa tính chia giải): 6/55 ≈ ${vnd(DATA.games.power655.value.breakeven_jackpot)}, 6/45 ≈ ${vnd(DATA.games.power645.value.breakeven_jackpot)}, 5/35 ≈ ${vnd(DATA.games.power535.value.breakeven_jackpot)}.</li>
    <li>Keno: RTP chỉ phụ thuộc bậc chơi (50% đến ≈ 57%).</li>
  </ul>`)}

  ${t("gioi-han", "Giới hạn", `<ul>
    <li>Kiểm định chỉ phát hiện được độ lệch đủ lớn so với lượng dữ liệu; "không phát hiện" không chứng minh tuyệt đối là không có.</li>
    <li>Mức độ phổ biến của bộ số là ước lượng theo kinh nghiệm, không có dữ liệu vé bán ra.</li>
    <li>Chỉ phục vụ nghiên cứu, giáo dục. Xổ số có kỳ vọng âm; đừng chơi quá khả năng.</li>
  </ul>`)}
  </div>`;
  document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
