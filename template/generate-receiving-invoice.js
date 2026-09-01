module.exports = `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  <title>Payment Receipt</title>
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
                  Receipt For Invoice</div>
                <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:600;color:#ffffff;">
                  {{invoiceNumber}}</div>
                <div
                  style="display:inline-block;margin-top:10px;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:#eafaf3;color:#1a8a57;">
                  PAYMENT RECEIVED</div>
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
        <td style="padding:22px 28px;border-right:1px solid #dde2ec;width:50%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Receipt Date</div>
          <div style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#0f1117;">
            {{receiptDate}}</div>
        </td>
        <td style="padding:22px 28px;width:50%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Amount Received</div>
          <div style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#1a8a57;">
            Rs {{receiptTotal}}</div>
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
                Received From
              </div>
              <div style="font-size:15px;font-weight:800;color:#0f1117;margin-bottom:5px;text-transform:capitalize;">
                {{studentName}}</div>
              <div style="font-size:12px;color:#4a5060;line-height:1.8;">
                {{studentEmail}}<br />
                <span style="font-weight:600;color:#0f1117;">{{studentPhone}}</span>
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
                {{salesManagerName}}<br />
                {{salesManagerEmail}}
              </div>
            </div>
          </td>
        </tr>
      </table>

      <!-- RECEIPT LINE ITEMS TABLE -->
      <div style="margin-bottom:28px;">
        <div
          style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:12px;">
          Payment Details</div>
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border:1px solid #dde2ec;border-radius:12px;overflow:hidden;border-collapse:collapse;">
          <thead>
            <tr style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);">
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Description</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Method</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Reference #</th>
              <th
                style="padding:12px 16px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Date</th>
              <th
                style="padding:12px 16px;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Receipt</th>
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
                <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Invoice Total</td>
                <td
                  style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#0f1117;font-size:13px;">
                  Rs {{totalAmount}}</td>
              </tr>
              <tr style="border-bottom:1px solid #dde2ec;">
                <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Total Paid To Date</td>
                <td
                  style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#1a8a57;font-size:13px;">
                  Rs {{paidAmount}}</td>
              </tr>
              <tr style="border-bottom:1px solid #dde2ec;">
                <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Remaining Balance</td>
                <td
                  style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#c94040;font-size:13px;">
                  Rs {{remainingAmount}}</td>
              </tr>
              <tr style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);">
                <td style="padding:11px 18px;font-size:14px;color:#94a3b8;font-weight:600;">Received This Receipt</td>
                <td
                  style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#ffffff;font-size:15px;">
                  Rs {{receiptTotal}}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- NOTES -->
      <div style="background:#f4f6fb;border:1px solid #dde2ec;border-radius:12px;padding:16px 20px;margin-bottom:32px;">
        <ul style="margin:0;padding-left:18px;font-size:13px;color:#4a5060;line-height:1.8;">
          <li>This is a system-generated receipt acknowledging payment received and requires no signature.</li>
          <li>All payments remitted are deemed final and non-refundable upon receipt.</li>
          <li>Please retain this receipt for your records.</li>
        </ul>
      </div>

    </div>

    <!-- FOOTER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dde2ec;background:#f4f6fb;">
      <tr>
        <td style="padding:22px 44px;text-align:center;">
          <div style="font-size:13px;font-weight:800;color:#1a3a5c;letter-spacing:-0.02em;">ALCO</div>
          <div style="font-size:11px;color:#8a92a6;margin-top:4px;">
            This is a system-generated receipt. No signature required.
          </div>
        </td>
      </tr>
    </table>

  </div>
</body>

</html>
`;