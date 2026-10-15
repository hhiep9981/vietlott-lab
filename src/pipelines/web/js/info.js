/* info.js — "Phương pháp": strategies, terms, tests, methodology. */
function renderInfo() {
  const R655 = getModel("power655").final.cache.rules;
  const t = (id, title, body) => `<section id="${id}"><h2>${title}</h2>${body}</section>`;
  const dl = (rows) => `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>`;
  document.getElementById("app").innerHTML = `<div class="info">
  <h2 style="margin-top:24px">Phương pháp &amp; giải thích</h2>
  <p>Trang này giải thích cách Vietlott Lab thu thập dữ liệu, các thuật ngữ thống kê, các kiểm định, cách tạo pool số và cách backtest. Mục tiêu: mọi con số trên dashboard đều kiểm chứng được.</p>
  <nav class="toc">${[["tom-tat", "Tóm tắt"], ["du-lieu", "Dữ liệu"], ["thuat-ngu", "Thuật ngữ"], ["kiem-dinh", "Kiểm định"], ["pool-pp", "Pool số"], ["bo-loc", "Bộ lọc"], ["backtest-pp", "Backtest"], ["gia-tri", "Giá trị kỳ vọng"], ["gioi-han", "Giới hạn"]].map(([id, l]) => `<a href="#info" data-jump="${id}">${l}</a>`).join("")}</nav>

  ${t("tom-tat", "Tóm tắt", `<ul>
    <li>Không sản phẩm nào cho thấy độ lệch có ý nghĩa thống kê so với quay ngẫu nhiên công bằng.</li>
    <li>Không chiến lược chọn số nào thắng chọn ngẫu nhiên trong backtest walk-forward; pool số tối ưu trên quá khứ cũng không hơn pool ngẫu nhiên ở giai đoạn kiểm tra.</li>
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
    ["Lift", "Số trúng trung bình mỗi vé (hoặc mỗi pool) so với chọn ngẫu nhiên, theo %. Lift +1% nghĩa là trung bình trúng nhiều hơn 1% số — vẫn rất nhỏ so với nhiễu."],
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

  ${t("pool-pp", "Pool số: cách chọn và kiểm chứng", `<p>Mục <b>Pool số</b> gợi ý một nhóm K số (thay cho từng vé). Pool giống nhau với mọi người xem.</p><ol>
    <li><b>Chấm điểm.</b> Trước mỗi kỳ, mỗi số có ${Object.keys(POOL_FEATURES).length} yếu tố tính từ các kỳ đã quay: ${Object.values(POOL_FEATURES).map((x) => x[0].toLowerCase()).join(", ")}. Mỗi yếu tố được chuẩn hóa giữa các số (0 = trung bình, ±1 = một độ lệch chuẩn). <i>Markov bậc 1</i>: đếm trong lịch sử số lần số này về ngay sau các số vừa ra ở kỳ trước (chuỗi Markov 1 bước, gồm cả việc tự lặp lại). <i>Markov bậc 2</i>: tương tự với bước nhảy 2 kỳ, từ các số của kỳ cách đây 2 kỳ. Hai bước được cộng có trọng số thay vì dùng trạng thái chung của 2 kỳ liền nhau, vì trạng thái chung có quá nhiều tổ hợp so với ~1.000–1.300 kỳ dữ liệu.</li>
    <li><b>Điểm</b> = tổng (yếu tố × trọng số). Trọng số dương ưu tiên số có giá trị cao, âm ưu tiên giá trị thấp. Nhờ vậy cùng một công thức bao gồm cả số nóng, số lạnh, số vắng lâu, tránh/ưu tiên số vừa về, theo cặp. Pool = K số điểm cao nhất (bằng điểm thì lấy số nhỏ hơn).</li>
    <li><b>Dò và chọn K.</b> Thử ${fmt(DATA.games.power655.pool.n_weights)} bộ trọng số (${2 * Object.keys(POOL_FEATURES).length} bộ chỉ dùng một yếu tố, dấu + hoặc −, và các hướng ngẫu nhiên) cho mọi K trong lưới (6/55, 6/45: 7–18 số; 5/35: 6–15 số). Quy tắc chọn lồng nhau: trong một đoạn dữ liệu huấn luyện, với mỗi K dò trọng số trên 70% đầu; chọn K có z tốt nhất trên 30% còn lại (dữ liệu chưa dùng để dò trọng số); rồi dò lại trọng số cho K đó trên cả đoạn. Như vậy K không được chọn trên chính dữ liệu đã dùng để dò trọng số.</li>
    <li><b>Kiểm định chéo nhiều lớp (chọn K).</b> Chia 60% số kỳ gần nhất thành 6 khối liên tiếp; mỗi khối áp dụng quy tắc trên với dữ liệu trước khối rồi chấm trên khối (walk-forward lồng nhau). Báo cáo K được chọn ở từng khối, lift ngoài mẫu gộp, và lift ngoài mẫu của từng K. Một K tối ưu thật phải được chọn ổn định và thắng ngẫu nhiên ở các khối.</li>
    <li><b>Kiểm tra.</b> Chấm cấu hình đó trên 30% số kỳ còn lại — chưa dùng khi dò. Lift = số trúng trung bình ÷ kỳ vọng của pool ngẫu nhiên cùng K (K × số bóng quay ÷ tổng số) − 1; t-test và khoảng tin cậy 95%.</li>
    <li><b>Pool kỳ tới.</b> Áp dụng cùng quy tắc chọn K và trọng số trên toàn bộ dữ liệu rồi chấm điểm cho kỳ tới. Vì trọng số này đã "thấy" cả giai đoạn kiểm tra, backtest nó trên quá khứ sẽ đẹp hơn thực tế — con số đáng tin là kết quả ở bước Kiểm tra.</li>
  <li><b>Đối chiếu kết quả.</b> Mỗi lần cập nhật tự động, pool vừa công bố được lưu vào nhật ký (<code>data/pool_log.jsonl</code> trong repo, kèm K và trọng số). Bảng "Kết quả gần nhất" ở mục Phân tích so mỗi kỳ với pool đã công bố trước kỳ đó; với các kỳ trước khi có nhật ký, pool được tái dựng bằng trọng số chỉ dò trên giai đoạn trước kiểm tra. "Hạng điểm" của một số trúng là thứ hạng của nó trong bảng điểm (1 = cao nhất): nếu cách chấm điểm có tác dụng, số trúng phải dồn về các hạng đầu.</li>
  </ol><p>Lift ở giai đoạn dò luôn dương vì đã chọn cấu hình tốt nhất trong hàng nghìn lựa chọn trên chính dữ liệu đó (quá khớp). Chỉ kết quả kiểm tra phản ánh khả năng thật. Số trúng chỉ tính số chính (không tính số đặc biệt 6/55 và số 1–12 của 5/35).</p>
  <p><b>Backtest Python</b> (mục Phân tích) còn so các chiến lược chọn vé: Random, Hot, Cold, Not repeat, Exponential decay, Long absence, Markov chain, Pair frequency, Pattern (gaps), Unseen pool.</p>`)}

  ${t("bo-loc", "Bộ lọc tiêu chuẩn", `<ul>
    <li>Luôn loại các bộ đã từng là kết quả.</li>
    <li>Tổng các số nằm trong 80% giữa của phân phối (xấp xỉ chuẩn) — VD 6/55: ${fmt(R655.sum_lo)}–${fmt(R655.sum_hi)}.</li>
    <li>Số lượng số lẻ và số nhỏ thuộc các giá trị phổ biến nhất (tổng xác suất ≥ 80%).</li>
    <li>Khoảng cách lớn nhất giữa hai số liền nhau trong vé ≤ phân vị 95% lịch sử; số cặp liền nhau ≤ phân vị 90%.</li>
  </ul><p>Bộ lọc dùng trong backtest Python (Unseen pool) và mục đánh giá vé ở popup phân tích bộ số. Nó làm vé trông giống một kỳ quay điển hình. Nó <b>không</b> làm tăng xác suất trúng: mỗi bộ số cụ thể vẫn có xác suất như nhau.</p>`)}

  ${t("backtest-pp", "Phương pháp backtest", `<ul>
    <li>Walk-forward: tại mỗi kỳ chỉ dùng các kỳ trước đó; sau khi chấm mới cập nhật dữ liệu.</li>
    <li>Mục <b>Backtest</b>: tự chọn K và trọng số, chấm pool từng kỳ so với pool ngẫu nhiên cùng K (kỳ vọng tính chính xác bằng phân phối siêu bội). Chỉ số chính là lift của số trúng trung bình mỗi kỳ. Mặc định dùng cấu hình "Tối ưu (đã kiểm tra)" — trọng số chỉ dò trên giai đoạn trước kiểm tra, nên trên giai đoạn kiểm tra nó cho đúng kết quả ở mục Pool số. Cấu hình "Pool kỳ tới" kèm cảnh báo quá khớp.</li>
    <li>Backtest Python (mục Phân tích): chiến lược và Ngẫu nhiên chạy trên cùng các kỳ, cùng số vé; kiểm định trên trung bình mỗi kỳ vì các vé trong cùng kỳ không độc lập; giải thưởng theo bảng chính thức, Jackpot ở mức tối thiểu, giá vé 10.000đ.</li>
    <li>Khi thử nhiều trọng số/K/giai đoạn, sẽ có lúc thấy kết quả "tốt" do may mắn. Một quy luật thật phải lặp lại trên dữ liệu mới.</li>
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
