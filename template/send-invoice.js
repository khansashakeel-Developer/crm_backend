module.exports = `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Invoice</title>
</head>

<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial, Helvetica, sans-serif;">

  <div style="width:100%;max-width:860px;margin:0 auto;background:#ffffff;">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:36px 44px 30px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <img
                    src="https://res.cloudinary.com/dmbpjv9e8/image/upload/h_110,q_100,f_png/v1777543091/logo-white_xg7uyj.webp"
                    alt="Arslan Larik & Company" style="height:40px;width:auto;display:block;" />
                </td>
              </tr>
            </table>
            <div style="font-size:11.5px;color:#94a3b8;line-height:1.7;margin-top:14px;">
              D86/1, block 7, Gulshan-e-iqbal, karachi, Sindh PK<br />
              connect@arslanlarik.com &nbsp;|&nbsp; 1+8886814808<br />
              https://arslanlarik.com/ &nbsp;|&nbsp; NTN: 2826497-5
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
            <div style="margin-top:14px;font-size:10px;color:#94a3b8;letter-spacing:0.08em;">ISSUE DATE</div>
            <div style="font-family:'Courier New',monospace;font-size:13px;color:#ffffff;margin-top:3px;">{{issueDate}}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- GOLD LINE -->
    <div style="height:3px;background:linear-gradient(90deg,#c8a84b,#e8c96a,#c8a84b);"></div>

    <!-- META ROW -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #dde2ec;">
      <tr>
        <td style="padding:18px 24px;border-right:1px solid #dde2ec;width:25%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Advance Due Date</div>
          <div style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#0f1117;">
            {{advanceDueDate}}</div>
        </td>
        <td style="padding:18px 24px;border-right:1px solid #dde2ec;width:25%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Batch</div>
          <div style="font-size:13px;font-weight:700;color:#0f1117;">{{batchName}}</div>
        </td>
        <td style="padding:18px 24px;border-right:1px solid #dde2ec;width:25%;">
          <div
            style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8a92a6;margin-bottom:5px;">
            Batch Dates</div>
          <div style="font-family:'Courier New',monospace;font-size:11.5px;color:#4a5060;">{{batchStartDate}} –
            {{batchEndDate}}</div>
        </td>
        <td style="padding:18px 24px;width:25%;">
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
          <!-- Billed To -->
          <td style="width:48%;vertical-align:top;padding-right:12px;">
            <div style="background:#f4f6fb;border-radius:14px;padding:20px 22px;border:1px solid #dde2ec;">
              <div
                style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.13em;color:#8a92a6;margin-bottom:12px;">
                <span
                  style="display:inline-block;width:16px;height:2px;background:#c8a84b;border-radius:2px;vertical-align:middle;margin-right:7px;"></span>
                Billed To
              </div>
              <div style="font-size:15px;font-weight:800;color:#0f1117;margin-bottom:8px;text-transform:capitalize;">
                {{studentName}}</div>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;">
                    Email</td>
                  <td style="font-size:12px;color:#0f1117;padding-bottom:4px;">{{studentEmail}}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;">
                    Phone</td>
                  <td style="font-size:12px;font-weight:600;color:#0f1117;padding-bottom:4px;">{{studentPhone}}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;">CNIC
                  </td>
                  <td style="font-family:'Courier New',monospace;font-size:12px;color:#0f1117;padding-bottom:4px;">
                    {{studentCnic}}</td>
                </tr>
                <tr>
                  <td
                    style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;vertical-align:top;">
                    Address</td>
                  <td style="font-size:12px;color:#4a5060;padding-bottom:4px;line-height:1.5;">{{studentAddress}}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;white-space:nowrap;">Profession</td>
                  <td style="font-size:12px;color:#4a5060;">{{studentProfession}}</td>
                </tr>
              </table>
            </div>
          </td>

          <!-- Issued By -->
          <td style="width:4%;"></td>
          <td style="width:48%;vertical-align:top;padding-left:12px;">
            <div style="background:#f4f6fb;border-radius:14px;padding:20px 22px;border:1px solid #dde2ec;">
              <div
                style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.13em;color:#8a92a6;margin-bottom:12px;">
                <span
                  style="display:inline-block;width:16px;height:2px;background:#c8a84b;border-radius:2px;vertical-align:middle;margin-right:7px;"></span>
                Issued By
              </div>
              <div style="font-size:15px;font-weight:800;color:#0f1117;margin-bottom:8px;">Arslan Larik &amp; Company
              </div>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;">
                    Brand</td>
                  <td style="font-size:12px;color:#0f1117;padding-bottom:4px;">ALCO — Finance Dept.</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;">NTN
                  </td>
                  <td style="font-family:'Courier New',monospace;font-size:12px;color:#0f1117;padding-bottom:4px;">
                    2826497-5</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;padding-bottom:4px;white-space:nowrap;">
                    Manager</td>
                  <td style="font-size:12px;font-weight:600;color:#0f1117;padding-bottom:4px;">{{salesManagerName}}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#8a92a6;padding-right:8px;white-space:nowrap;">Email</td>
                  <td style="font-size:12px;color:#4a5060;">{{salesManagerEmail}}</td>
                </tr>
              </table>
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
                style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;width:36px;">
                #</th>
              <th
                style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Description</th>
              <th
                style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;width:50px;">
                Qty</th>
              <th
                style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;width:50px;">
                Payment Method</th>
              <th
                style="padding:12px 14px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;width:50px;">
                Reference No</th>
              <th
                style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Due Date</th>
              <th
                style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
                Status</th>
              <th
                style="padding:12px 14px;text-align:right;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">
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

      <!-- TERMS & NOTES -->
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
    <div style="height:3px;background:linear-gradient(90deg,#c8a84b,#e8c96a,#c8a84b);"></div>
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