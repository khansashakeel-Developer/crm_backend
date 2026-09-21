module.exports = `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  <title>Invoice</title>
</head>

<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial, Helvetica, sans-serif;">

  <div style="width:100%;max-width:860px;margin:0 auto;background:#ffffff;">

    <!-- HEADER -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);">
      <tr>
        <td style="padding:36px 44px 30px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:top;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img
                        src="https://res.cloudinary.com/dmbpjv9e8/image/upload/h_110,q_100,f_png/v1777543091/logo-white_xg7uyj.webp"
                        alt="AL&CO" width="150"
                        style="height:40px;width:auto;max-width:150px;display:block;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:16px;font-weight:700;font-family:Arial, Helvetica, sans-serif;" />
                    </td>
                  </tr>
                </table>
                <div style="font-size:11.5px;color:#94a3b8;line-height:1.7;margin-top:14px;">
  D86/1, block 7, Gulshan-e-iqbal, karachi, Sindh PK<br />
  <a href="mailto:connect@arslanlarik.com" style="color:#94a3b8 !important;text-decoration:none !important;">connect@arslanlarik.com</a>
  &nbsp;|&nbsp;
  <a href="tel:+8886814808" style="color:#94a3b8 !important;text-decoration:none !important;">1+8886814808</a><br />
  <a href="https://arslanlarik.com/" style="color:#94a3b8 !important;text-decoration:none !important;">https://arslanlarik.com/</a>
</div>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <div
                  style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">
                  Invoice Number</div>
                <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:600;color:#ffffff;">
                  {{invoiceNumber}}</div>
                <div
                  style="display:inline-block;margin-top:10px;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:#fff8e8;color:#b07800;">
                  {{invoiceStatus}}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- GOLD LINE -->
    <div style="height:3px;background:linear-gradient(90deg,#c8a84b,#e8c96a,#c8a84b);"></div>

    <!-- META ROW -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #dde2ec;">
      <tr>
        <td style="padding:22px 28px;border-right:1px solid #dde2ec;width:33%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Issue Date</div>
          <div style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#0f1117;">{{issueDate}}
          </div>
        </td>
        <td style="padding:22px 28px;border-right:1px solid #dde2ec;width:33%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Advance Due Date</div>
          <div style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#0f1117;">
            {{advanceDueDate}}</div>
        </td>
        <td style="padding:22px 28px;width:33%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Enrollment ID</div>
          <div style="font-family:'Courier New',monospace;font-size:11px;color:#4a5060;">{{enrollmentId}}</div>
        </td>
      </tr>
    </table>

    <!-- BODY -->
    <div style="padding:32px 44px;">

      <!-- PARTIES -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="width:48%;vertical-align:top;padding-right:12px;">
            <div style="background:#f4f6fb;border-radius:14px;padding:20px 22px;border:1px solid #dde2ec;">
              <div
                style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.13em;color:#8a92a6;margin-bottom:12px;">
                <span
                  style="display:inline-block;width:16px;height:2px;background:#c8a84b;border-radius:2px;vertical-align:middle;margin-right:7px;"></span>
                Billed To
              </div>
              <div style="font-size:15px;font-weight:800;color:#0f1117;margin-bottom:5px;text-transform:capitalize;">
                {{studentName}}</div>
              <div style="font-size:12px;color:#4a5060;line-height:1.8;">
                {{studentEmail}}<br />
                <span style="font-weight:600;color:#0f1117;">{{studentPhone}}</span><br />
                {{studentProfession}}
              </div>
            </div>
          </td>
          <td style="width:4%;"></td>
          <td style="width:48%;vertical-align:top;padding-left:12px;">
            <div style="background:#f4f6fb;border-radius:14px;padding:20px 22px;border:1px solid #dde2ec;">
              <div
                style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.13em;color:#8a92a6;margin-bottom:12px;">
                <span
                  style="display:inline-block;width:16px;height:2px;background:#c8a84b;border-radius:2px;vertical-align:middle;margin-right:7px;"></span>
                Issued By
              </div>
              <div style="font-size:15px;font-weight:800;color:#0f1117;margin-bottom:5px;">ALCO &mdash; Finance Dept.
              </div>
              <div style="font-size:12px;color:#4a5060;line-height:1.8;">
                Assigned Sales Manager:<br />
                <span style="font-weight:600;color:#0f1117;">{{salesManagerName}}</span><br />
                {{salesManagerEmail}}
              </div>
            </div>
          </td>
        </tr>
      </table>

      <!-- PROGRAM BAND -->
      <div style="background:#e8f0f8;border:1px solid #c5d8ee;border-radius:12px;padding:14px 20px;margin-bottom:28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:36px;vertical-align:middle;">
              <div
                style="width:36px;height:36px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);border-radius:9px;text-align:center;line-height:36px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <div
                style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a3a5c;margin-bottom:2px;">
                Enrolled Program</div>
              <div style="font-size:14px;font-weight:800;color:#1a3a5c;">{{programName}}</div>
            </td>
            <td style="vertical-align:middle;text-align:right;">
              <div style="font-size:11.5px;color:#4a5060;font-style:italic;max-width:220px;line-height:1.5;">
                {{planNotes}}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- PAYMENT SCHEDULE TABLE -->
      <div style="margin-bottom:28px;">
        <div
          style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:12px;">
          Payment Schedule</div>
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border:1px solid #dde2ec;border-radius:12px;overflow:hidden;border-collapse:collapse;">
          <thead>
            <tr style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);">
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;width:40px;">
                #</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Description</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Qty</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Due Date</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Status</th>
              <th
                style="padding:12px 16px;text-align:right;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Amount</th>
            </tr>
          </thead>
          <tbody>
            {{installmentRows}}
          </tbody>
        </table>
      </div>

      <!-- TOTALS -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td></td>
          <td style="width:320px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #dde2ec;border-radius:14px;overflow:hidden;border-collapse:collapse;">
              <tr style="border-bottom:1px solid #dde2ec;">
  <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Subtotal (Gross)</td>
  <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#0f1117;font-size:13px;">Rs {{totalAmount}}</td>
</tr>
{{discountRow}}
<tr style="border-bottom:1px solid #dde2ec;">
  <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Net Total</td>
  <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#0f1117;font-size:13px;">Rs {{netAmount}}</td>
</tr>
<tr style="border-bottom:1px solid #dde2ec;">
  <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Amount Paid</td>
  <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#1a8a57;font-size:13px;">Rs {{paidAmount}}</td>
</tr>
<tr style="border-bottom:1px solid #dde2ec;">
  <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Outstanding Balance</td>
  <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#c94040;font-size:13px;">Rs {{remainingAmount}}</td>
</tr>
<tr style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);">
  <td style="padding:11px 18px;font-size:14px;color:#94a3b8;font-weight:600;">Total Invoice Amount</td>
  <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#ffffff;font-size:15px;">Rs {{netAmount}}</td>
</tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- NOTES -->
      <div style="background:#f4f6fb;border:1px solid #dde2ec;border-radius:12px;padding:16px 20px;margin-bottom:32px;">
        <div
          style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:10px;">
          Terms &amp; Notes
        </div>

        <ul style="margin:0;padding-left:18px;font-size:13px;color:#4a5060;line-height:1.8;">
          <li>This is an auto-generated invoice and therefore requires no signature.</li>

          <li>All payments remitted, including initial down payments, are deemed final and non-refundable upon receipt.
          </li>

          <li>Certificates will be awarded after successful test evaluation and full payment completion.</li>

          <li>Company NTN Number: <strong style="color:#0f1117;">2826497-5</strong></li>

          <li>Cheques should be crossed and made payable to <strong style="color:#0f1117;">Arslan Larik &amp;
              Company</strong>.</li>

          <li>Bank details will be provided upon request.</li>
        </ul>
      </div>

    </div>

    <!-- FOOTER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dde2ec;background:#f4f6fb;">
      <tr>
        <td style="padding:22px 44px;vertical-align:top;">
          <div style="font-size:12px;font-weight:700;color:#4a5060;margin-bottom:8px;">
            Payment Methods Accepted
          </div>

          <div style="font-size:11px;color:#8a92a6;line-height:1.8;">
            Cash &nbsp;|&nbsp; Bank Transfer &nbsp;|&nbsp; Cheque<br /><br />

            <strong style="color:#0f1117;">HBL Bank</strong><br />
            <strong>Account Title:</strong> ARSLAN LARIK &amp; Company<br />
            <strong>Account Number:</strong> 19107901888203<br />
            <strong>IBAN:</strong> PK94HABB0019107901888203<br />
            <strong>Branch:</strong> Korangi Road, DHA Phase II
          </div>
        </td>

        <td style="padding:22px 44px;text-align:right;vertical-align:top;">
          <div style="font-size:13px;font-weight:800;color:#1a3a5c;letter-spacing:-0.02em;">
            ALCO
          </div>
          <div style="font-size:11px;color:#8a92a6;margin-top:4px;">
            This is a system-generated invoice.<br />
            No signature required.
          </div>
        </td>
      </tr>
    </table>

  </div>
</body>

</html>
`;


// module.exports = `
// <!DOCTYPE html>
// <html lang="en">
// <head>
// <meta charset="UTF-8" />
// <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
// <title>Invoice</title>
// <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet"/>
// <style>
//   *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
//   :root {
//     --ink: #0f1117; --ink-soft: #4a5060; --ink-muted: #8a92a6;
//     --accent: #1a3a5c; --accent-light: #e8f0f8;
//     --gold: #c8a84b; --gold-light: #fdf6e3;
//     --border: #dde2ec; --white: #ffffff; --bg: #f4f6fb;
//     --paid-bg: #eafaf3; --paid-text: #1a8a57;
//     --pending-bg: #fff8e8; --pending-text: #b07800;
//   }
//   body { font-family: 'Syne', sans-serif; background: var(--bg); color: var(--ink); }
//   #invoice-wrapper { width: 100%; max-width: 860px; margin: auto; background: var(--white); }
//   .inv-header { background: var(--accent); padding: 36px 44px 30px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
//   .brand-block { display: flex; flex-direction: column; gap: 6px; }
//   .brand-logo { display: flex; align-items: center; gap: 12px; }
//   .brand-icon { width: 44px; height: 44px; background: var(--gold); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: var(--accent); flex-shrink: 0; }
//   .brand-name { font-size: 22px; font-weight: 800; color: var(--white); letter-spacing: -0.02em; line-height: 1; }
//   .brand-tagline { font-size: 11px; color: rgba(255,255,255,0.55); font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px; }
//   .brand-address { font-size: 11.5px; color: rgba(255,255,255,0.60); line-height: 1.7; margin-top: 14px; }
//   .inv-num-block { text-align: right; }
//   .inv-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.50); margin-bottom: 6px; }
//   .inv-number { font-family: 'IBM Plex Mono', monospace; font-size: 26px; font-weight: 600; color: var(--white); }
//   .inv-status-badge { display: inline-block; margin-top: 10px; padding: 5px 14px; border-radius: 50px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: var(--pending-bg); color: var(--pending-text); }
//   .gold-line { height: 3px; background: linear-gradient(90deg, var(--gold), #e8c96a, var(--gold)); }
//   .meta-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-bottom: 1px solid var(--border); }
//   .meta-cell { padding: 22px 28px; border-right: 1px solid var(--border); }
//   .meta-cell:last-child { border-right: none; }
//   .meta-cell-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); margin-bottom: 5px; }
//   .meta-cell-value { font-size: 13.5px; font-weight: 700; color: var(--ink); }
//   .meta-cell-value.mono { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
//   .inv-body { padding: 32px 44px; }
//   .parties-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 36px; }
//   .party-card { background: var(--bg); border-radius: 14px; padding: 20px 22px; border: 1px solid var(--border); }
//   .party-heading { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.13em; color: var(--ink-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
//   .party-heading::before { content: ''; display: inline-block; width: 16px; height: 2px; background: var(--gold); border-radius: 2px; }
//   .party-name { font-size: 15px; font-weight: 800; color: var(--ink); margin-bottom: 5px; text-transform: capitalize; }
//   .party-detail { font-size: 12px; color: var(--ink-soft); line-height: 1.8; }
//   .party-detail span { font-weight: 600; color: var(--ink); }
//   .program-band { background: var(--accent-light); border: 1px solid #c5d8ee; border-radius: 12px; padding: 14px 20px; margin-bottom: 28px; display: flex; align-items: center; gap: 14px; }
//   .program-icon { width: 36px; height: 36px; background: var(--accent); border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
//   .program-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent); margin-bottom: 2px; }
//   .program-name { font-size: 14px; font-weight: 800; color: var(--accent); }
//   .program-note { margin-left: auto; font-size: 11.5px; color: var(--ink-soft); font-style: italic; max-width: 220px; text-align: right; line-height: 1.5; }
//   .table-section { margin-bottom: 28px; }
//   .table-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); margin-bottom: 12px; }
//   table { width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
//   thead tr { background: var(--accent); }
//   thead th { padding: 12px 16px; text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.75); }
//   thead th:last-child { text-align: right; }
//   tbody tr { border-bottom: 1px solid var(--border); }
//   tbody tr:last-child { border-bottom: none; }
//   tbody tr.advance-row { background: var(--gold-light); }
//   tbody td { padding: 13px 16px; font-size: 13px; color: var(--ink); }
//   tbody td:last-child { text-align: right; }
//   .td-num { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; font-weight: 600; color: var(--ink-muted); }
//   .td-desc { font-weight: 700; }
//   .td-desc small { display: block; font-size: 10.5px; font-weight: 400; color: var(--ink-muted); margin-top: 1px; }
//   .td-date { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--ink-soft); }
//   .td-amount { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 13.5px; }
//   .badge-advance { display: inline-block; background: var(--gold); color: #5a3a00; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; margin-left: 7px; vertical-align: middle; }
//   .inst-status { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 9px; border-radius: 5px; background: var(--pending-bg); color: var(--pending-text); }
//   .inst-status.paid { background: var(--paid-bg); color: var(--paid-text); }
//   .totals-block { display: flex; justify-content: flex-end; margin-bottom: 32px; }
//   .totals-inner { width: 320px; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
//   .total-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 18px; border-bottom: 1px solid var(--border); font-size: 13px; }
//   .total-row:last-child { border-bottom: none; }
//   .total-row-label { color: var(--ink-soft); font-weight: 500; }
//   .total-row-value { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--ink); font-size: 13px; }
//   .total-row.grand { background: var(--accent); font-size: 14px; }
//   .total-row.grand .total-row-label { color: rgba(255,255,255,0.7); font-weight: 600; }
//   .total-row.grand .total-row-value { color: var(--white); font-size: 15px; }
//   .total-row.remaining-row .total-row-value { color: #c94040; }
//   .total-row.paid-row .total-row-value { color: var(--paid-text); }
//   .notes-block { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-bottom: 32px; }
//   .notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); margin-bottom: 6px; }
//   .notes-text { font-size: 13px; color: var(--ink-soft); line-height: 1.6; }
//   .inv-footer { border-top: 1px solid var(--border); padding: 22px 44px; display: flex; align-items: center; justify-content: space-between; background: var(--bg); }
//   .footer-left { font-size: 11px; color: var(--ink-muted); line-height: 1.7; }
//   .footer-left strong { color: var(--ink-soft); display: block; margin-bottom: 2px; font-size: 12px; }
//   .footer-right { text-align: right; font-size: 11px; color: var(--ink-muted); }
//   .footer-brand { font-size: 13px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
//   .footer-divider { width: 1px; height: 48px; background: var(--border); flex-shrink: 0; }
// </style>
// </head>
// <body>
// <div id="invoice-wrapper">

//   <div class="inv-header">
//     <div class="brand-block">
//       <div class="brand-logo">
//         <div class="brand-icon">AL</div>
//         <div>
//           <div class="brand-name">ALCO</div>
//           <div class="brand-tagline">Academy of Life Coaching</div>
//         </div>
//       </div>
//       <div class="brand-address">
//         D86/1, block 7, Gulshan-e-iqbal, karachi, Sindh PK<br/>
//         connect@arslanlarik.com &nbsp;|&nbsp; 1+8886814808<br/>
//         https://arslanlarik.com/
//       </div>
//     </div>
//     <div class="inv-num-block">
//       <div class="inv-label">Invoice Number</div>
//       <div class="inv-number">{{invoiceNumber}}</div>
//       <div class="inv-status-badge">{{invoiceStatus}}</div>
//     </div>
//   </div>

//   <div class="gold-line"></div>

//   <div class="meta-row">
//     <div class="meta-cell">
//       <div class="meta-cell-label">Issue Date</div>
//       <div class="meta-cell-value mono">{{issueDate}}</div>
//     </div>
//     <div class="meta-cell">
//       <div class="meta-cell-label">Advance Due Date</div>
//       <div class="meta-cell-value mono">{{advanceDueDate}}</div>
//     </div>
//     <div class="meta-cell">
//       <div class="meta-cell-label">Enrollment ID</div>
//       <div class="meta-cell-value mono" style="font-size:11px;color:var(--ink-soft)">{{enrollmentId}}</div>
//     </div>
//   </div>

//   <div class="inv-body">

//     <div class="parties-row">
//       <div class="party-card">
//         <div class="party-heading">Billed To</div>
//         <div class="party-name">{{studentName}}</div>
//         <div class="party-detail">
//           {{studentEmail}}<br/>
//           <span>{{studentPhone}}</span><br/>
//           {{studentProfession}}
//         </div>
//       </div>
//       <div class="party-card">
//         <div class="party-heading">Issued By</div>
//         <div class="party-name">ALCO &mdash; Finance Dept.</div>
//         <div class="party-detail">
//           Assigned Sales Manager:<br/>
//           <span>{{salesManagerName}}</span><br/>
//           {{salesManagerEmail}}
//         </div>
//       </div>
//     </div>

//     <div class="program-band">
//       <div class="program-icon">
//         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
//           <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
//         </svg>
//       </div>
//       <div>
//         <div class="program-label">Enrolled Program</div>
//         <div class="program-name">{{programName}}</div>
//       </div>
//       <div class="program-note">{{planNotes}}</div>
//     </div>

//     <div class="table-section">
//       <div class="table-title">Payment Schedule</div>
//       <table>
//         <thead>
//           <tr>
//             <th style="width:40px">#</th>
//             <th>Description</th>
//             <th>Due Date</th>
//             <th>Status</th>
//             <th>Amount</th>
//           </tr>
//         </thead>
//         <tbody>
//           {{installmentRows}}
//         </tbody>
//       </table>
//     </div>

//     <div class="totals-block">
//       <div class="totals-inner">
//         <div class="total-row">
//           <span class="total-row-label">Subtotal</span>
//           <span class="total-row-value">Rs {{totalAmount}}</span>
//         </div>
//         <div class="total-row paid-row">
//           <span class="total-row-label">Amount Paid</span>
//           <span class="total-row-value">Rs {{paidAmount}}</span>
//         </div>
//         <div class="total-row remaining-row">
//           <span class="total-row-label">Outstanding Balance</span>
//           <span class="total-row-value">Rs {{remainingAmount}}</span>
//         </div>
//         <div class="total-row grand">
//           <span class="total-row-label">Total Invoice Amount</span>
//           <span class="total-row-value">Rs {{totalAmount}}</span>
//         </div>
//       </div>
//     </div>

//     <div class="notes-block">
//       <div class="notes-label">Terms &amp; Notes</div>
//       <div class="notes-text">
//         Advance payment of <strong>Rs {{advanceAmount}}</strong> must be received by
//         <strong>{{advanceDueDate}}</strong> to activate enrollment.
//         Remaining installments are due monthly as per schedule above.
//         Late payments may result in restricted portal access.
//         For queries contact: <strong>finance@arslanlarik.com</strong>
//       </div>
//     </div>

//   </div>

//   <div class="inv-footer">
//     <div class="footer-left">
//       <strong>Payment Methods Accepted</strong>
//       Cash &nbsp;|&nbsp; Bank Transfer &nbsp;|&nbsp; Cheque<br/>
//       Account: ALCO Academy &nbsp;|&nbsp; HBL: 0123-456789-01
//     </div>
//     <div class="footer-divider"></div>
//     <div class="footer-right">
//       <div class="footer-brand">ALCO</div>
//       <div style="margin-top:4px">This is a system-generated invoice.<br/>No signature required.</div>
//     </div>
//   </div>

// </div>
// </body>
// </html>
// `;
