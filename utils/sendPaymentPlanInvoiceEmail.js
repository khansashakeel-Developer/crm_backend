const Invoice = require("../models/invoiceModel.js");
const sendEmailDynamic = require("./sendEmailDynamic.js");

async function sendPaymentPlanInvoiceEmail(invoiceId) {
  const invoice = await Invoice.findById(invoiceId)
    .populate("user", "name email phone")
    .populate({
      path: "enrollment",
      populate: [
        { path: "program", select: "name" },
        { path: "batch", select: "name start_date end_date" },
      ],
    });

  if (!invoice) {
    console.warn("sendPaymentPlanInvoiceEmail: invoice not found —", invoiceId);
    return null;
  }

  const user = invoice.user;
  if (!user?.email) {
    console.warn("sendPaymentPlanInvoiceEmail: user/email missing on invoice —", invoiceId);
    return null;
  }

  const program = invoice.enrollment?.program;

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

  const quantity =
    invoice.enrollment?.bundle?.courses?.length ||
    invoice.enrollment?.courses?.length ||
    1;

  const installmentRows = invoice.installments
    .map((inst, i) => {
      const isAdv = inst.isAdvance;
      const isPaid = inst.status === "PAID";
      return `
      <tr style="background:${isAdv ? "#fdf6e3" : "#ffffff"}; border-bottom:1px solid #dde2ec;">
        <td style="padding:13px 16px; font-size:11px; color:#8a92a6;">${String(i + 1).padStart(2, "0")}</td>
        <td style="padding:13px 16px; font-size:13px; color:#0f1117; font-weight:700;">
          ${isAdv ? "Advance Payment" : inst.label || `Installment ${i + 1}`}
          ${isAdv ? `<span style="background:#c8a84b; color:#5a3a00; font-size:9px; font-weight:700; padding:2px 8px; border-radius:4px; margin-left:7px;">Advance</span>` : ""}
        </td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${quantity}</td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060; text-transform:capitalize;">${inst.method || "—"}</td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${inst.referenceNumber || "—"}</td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${formatDate(inst.dueDate)}</td>
        <td style="padding:13px 16px;">
          <span style="font-size:9.5px; font-weight:700; padding:3px 9px; border-radius:5px;
            background:${isPaid ? "#eafaf3" : "#fff8e8"}; color:${isPaid ? "#1a8a57" : "#b07800"};">
            ${inst.status}
          </span>
        </td>
        <td style="padding:13px 16px; text-align:right; font-weight:600; font-size:13px;">
          Rs ${formatAmount(inst.amount)}
        </td>
      </tr>`;
    })
    .join("");

  const contractDetails = invoice.enrollment?.leadSnapshot?.contractDetails;

  await sendEmailDynamic({
    to: user.email,
    subject: `Invoice ${invoice.invoiceNumber} | ALCO`,
    templateName: "send-invoice",
    replacements: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.status,
      issueDate: formatDate(invoice.issueDate || new Date()),
      advanceDueDate: formatDate(invoice.dueDate),
      enrollmentId:
        invoice.enrollment?._id?.toString().slice(0, 8) +
        "..." +
        invoice.enrollment?._id?.toString().slice(-4),
      studentName: user.name,
      studentEmail: user.email,
      studentPhone: user.phone || "—",
      salesManagerName: "Finance Team",
      salesManagerEmail: "finance@arslanlarik.com",
      batchName: invoice.enrollment?.batch?.name || "—",
      batchStartDate: formatDate(invoice.enrollment?.batch?.start_date),
      batchEndDate: formatDate(invoice.enrollment?.batch?.end_date),
      studentCnic: contractDetails?.cnic || "—",
      studentAddress: contractDetails?.currentAddress || "—",
      studentProfession: contractDetails?.occupation || "—",
      programName: program?.name || "Program",
      planNotes: invoice.notes || "",
      installmentRows,
      totalAmount: formatAmount(invoice.totalAmount),
      paidAmount: formatAmount(invoice.paidAmount || 0),
      remainingAmount: formatAmount(invoice.remainingAmount || invoice.totalAmount),
      advanceAmount: formatAmount(
        invoice.installments.find((i) => i.isAdvance)?.amount || 0
      ),
    },
  });

  return true;
}

module.exports = sendPaymentPlanInvoiceEmail;