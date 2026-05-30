import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "./firebase";
import {
  collection, addDoc, onSnapshot, query,
  orderBy, doc, getDoc, setDoc, updateDoc, serverTimestamp,
  deleteDoc
} from "firebase/firestore";

const FIRM = {
  name: "Kushaan Packers",
  gstin: "06ACQPL0313F1ZY",
  address: "Shed No.2, Near Tata Motor Service Station, Opp. Jagdev Malik Kothi, Village Ugrakheri, Sanoli Road, Panipat, Haryana - 132103",
  phone1: "9896556789",
  phone2: "9896412626",
  email: "luthraankur02@gmail.com",
};

function getFinancialYear() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  const hasPaise = num % 1 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function numberToWords(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = "Rupees " + convert(rupees);
  if (paise > 0) words += " and " + convert(paise) + " Paise";
  return words + " Only";
}

// ============================================================
// PDF GENERATOR — jsPDF — Works on Phone + Laptop
// 3 copies: Original (full), Duplicate (short), Triplicate (short)
// ============================================================
function generateInvoicePDF(sale) {
  const lineItems = sale.lineItems && sale.lineItems.length > 0 ? sale.lineItems : [{
    srNo: 1,
    description: sale.description || "Corrugated Box",
    hsnCode: sale.hsnCode || "4819",
    size: sale.size || "",
    quantity: sale.quantity || 0,
    unit: sale.unit || "PCS",
    rate: sale.rate || 0,
    taxable: sale.taxableValue || 0,
    cgst: sale.cgstAmount || 0,
    sgst: sale.sgstAmount || 0,
    total: sale.totalAmount || 0,
  }];

  const totalTaxable = lineItems.reduce((s, i) => s + parseFloat(i.taxable || 0), 0);
  const totalCGST = lineItems.reduce((s, i) => s + parseFloat(i.cgst || 0), 0);
  const totalSGST = lineItems.reduce((s, i) => s + parseFloat(i.sgst || 0), 0);
  const grandTotal = lineItems.reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const amtWords = numberToWords(grandTotal);
  const fmtDate = (d) => {
    if (!d) return "";
    const p = d.split("-");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
  };

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210; const M = 10; const fw = W - M * 2;

  const drawKPLogo = (x, y, size = 18) => {
    doc.setFillColor(26, 92, 56);
    doc.rect(x, y, size, size, "F");
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, size / 2, size * 0.28, "F");
    doc.setFillColor(26, 92, 56);
    doc.rect(x, y, size / 2, size * 0.28, "F");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(x + size / 2, y, x + size / 2, y + size * 0.28);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(size * 0.55);
    doc.setFont("helvetica", "bold");
    doc.text("K", x + size * 0.22, y + size * 0.78, { align: "center" });
    doc.text("P", x + size * 0.78, y + size * 0.78, { align: "center" });
  };

  const drawHeader = (label, color, startY) => {
    const [r, g, b] = color;
    doc.setFillColor(r, g, b);
    doc.rect(M, startY, fw, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(label, M + 3, startY + 4.8);
    doc.setFontSize(8);
    doc.text("TAX INVOICE (U/s 31 Read with Rule 7)", M + fw - 2, startY + 4.8, { align: "right" });
    return startY + 7;
  };

  const drawFirmDetails = (startY, color, logoSize = 18) => {
    const [r, g, b] = color;
    drawKPLogo(M, startY, logoSize);
    doc.setTextColor(r, g, b);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("KUSHAAN PACKERS", M + logoSize + 4, startY + 7);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Manufacturers & Suppliers of: Corrugated Cartons, Sheets, Stiffeners etc.", M + logoSize + 4, startY + 11.5);
    doc.text("Near Tata Motors, Sanoli Road, Village Ugrakheri, Panipat-132103", M + logoSize + 4, startY + 15);
    doc.setFont("helvetica", "bold");
    doc.text(`GSTIN: 06ACQPL0313F1ZY  |  Mob: 98964-12626, 98965-56789  |  Email: luthraankur02@gmail.com`, M + logoSize + 4, startY + 19);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.line(M, startY + logoSize + 2, M + fw, startY + logoSize + 2);
    return startY + logoSize + 4;
  };

  const drawBillMeta = (startY) => {
    doc.setFillColor(245, 247, 255);
    doc.rect(M, startY, fw / 2 - 2, 22, "F");
    doc.rect(M + fw / 2 + 2, startY, fw / 2 - 2, 22, "F");
    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("BILL TO:", M + 2, startY + 4.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(sale.customerName || "", M + 2, startY + 9.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    if (sale.customerAddress) doc.text(sale.customerAddress, M + 2, startY + 14);
    doc.text(sale.customerGstin ? `GSTIN: ${sale.customerGstin}` : "B2C Customer", M + 2, startY + 18);
    if (sale.deliveryAddress && sale.deliveryAddress !== sale.customerAddress) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(26, 92, 56);
      doc.text("SHIP TO:", M + 2, startY + 22);
      doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
      doc.text(sale.deliveryAddress, M + 14, startY + 22);
    }
    const rx = M + fw / 2 + 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("Invoice No:", rx, startY + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(sale.invoiceNo || "", rx + 22, startY + 4.5);
    doc.setFont("helvetica", "bold");
    doc.text("Date:", rx, startY + 9.5);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(sale.date), rx + 22, startY + 9.5);
    if (sale.poNo) {
      doc.setFont("helvetica", "bold"); doc.text("PO No:", rx, startY + 14);
      doc.setFont("helvetica", "normal"); doc.text(sale.poNo, rx + 22, startY + 14);
    }
    if (sale.vehicleNo) {
      doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", rx, startY + 18);
      doc.setFont("helvetica", "normal"); doc.text(sale.vehicleNo, rx + 22, startY + 18);
    }
    if (sale.ewayBillNo) {
      doc.setFont("helvetica", "bold"); doc.text("E-Way Bill:", rx, startY + 22);
      doc.setFont("helvetica", "normal"); doc.text(sale.ewayBillNo, rx + 22, startY + 22);
    }
    return startY + 24;
  };

  const drawItemsTable = (startY, color) => {
    const [r, g, b] = color;
    const tableRows = lineItems.map(item => [
      item.srNo || 1,
      item.size ? `${item.description}\n${item.size}` : item.description,
      item.hsnCode || "4819",
      `${parseFloat(item.quantity || 0)} ${item.unit || "PCS"}`,
      parseFloat(item.rate || 0).toFixed(2),
      parseFloat(item.taxable || 0).toFixed(2),
      parseFloat(item.cgst || 0).toFixed(2),
      parseFloat(item.sgst || 0).toFixed(2),
      parseFloat(item.total || 0).toFixed(2),
    ]);
    tableRows.push(["", "TOTAL", "", "", "", totalTaxable.toFixed(2), totalCGST.toFixed(2), totalSGST.toFixed(2), grandTotal.toFixed(2)]);

    autoTable(doc, {
      startY,
      head: [["#", "Description / Box Name", "HSN", "Qty/Unit", "Rate", "Taxable", "CGST 2.5%", "SGST 2.5%", "Total"]],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [r, g, b], textColor: 255, fontSize: 7, fontStyle: "bold", halign: "center" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30] },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 45 },
        2: { halign: "center", cellWidth: 13 },
        3: { halign: "center", cellWidth: 18 },
        4: { halign: "right", cellWidth: 16 },
        5: { halign: "right", cellWidth: 20 },
        6: { halign: "right", cellWidth: 18 },
        7: { halign: "right", cellWidth: 18 },
        8: { halign: "right", cellWidth: 24 },
      },
      didParseCell: (data) => {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [220, 240, 220];
        }
      },
      margin: { left: M, right: M },
    });
    return doc.lastAutoTable.finalY + 2;
  };

  const drawTotalsBank = (startY, color) => {
    const [r, g, b] = color;
    const half = fw / 2;
    doc.setFillColor(235, 245, 255);
    doc.rect(M, startY, half - 2, 28, "F");
    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("BANK DETAILS:", M + 2, startY + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("Bank: State Bank of India", M + 2, startY + 9.5);
    doc.text("Near Hotel Gold, G.T. Road, Panipat", M + 2, startY + 13.5);
    doc.text("A/c No.: 40550814016  |  IFSC: SBIN0004050", M + 2, startY + 17.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.text("Amount in Words:", M + 2, startY + 22);
    doc.setFont("helvetica", "italic"); doc.setFontSize(6.5);
    const words = doc.splitTextToSize(amtWords, half - 6);
    doc.text(words, M + 2, startY + 25.5);

    const rx = M + half + 2;
    const rw = half - 2;
    const totRows = [
      ["Taxable Amount", totalTaxable.toFixed(2)],
      ["CGST @ 2.5%", totalCGST.toFixed(2)],
      ["SGST @ 2.5%", totalSGST.toFixed(2)],
    ];
    let ty = startY;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    totRows.forEach(([label, val]) => {
      doc.setFillColor(245, 247, 255);
      doc.rect(rx, ty, rw, 6, "F");
      doc.setDrawColor(180, 180, 200); doc.setLineWidth(0.2);
      doc.rect(rx, ty, rw, 6);
      doc.setTextColor(40, 40, 40);
      doc.text(`  ${label}`, rx + 1, ty + 4);
      doc.text(`Rs.${val}`, rx + rw - 1, ty + 4, { align: "right" });
      ty += 6;
    });
    doc.setFillColor(r, g, b);
    doc.rect(rx, ty, rw, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("  GRAND TOTAL", rx + 1, ty + 5.5);
    doc.text(`Rs.${grandTotal.toFixed(2)}`, rx + rw - 1, ty + 5.5, { align: "right" });
    return startY + 30;
  };

  const drawFooter = (startY) => {
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(`Terms: All disputes subject to Panipat jurisdiction. E. & O. E.`, M, startY + 4);
    doc.text(`E-Way Bill No: ${sale.ewayBillNo || "................................"}`, M, startY + 8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("For KUSHAAN PACKERS", M + fw - 2, startY + 4, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text("Authorized Signatory _______________", M + fw - 2, startY + 12, { align: "right" });
  };

  const drawShortCopy = (label, color) => {
    const isDuplicate = label.includes("DUPLICATE");
    let y = drawHeader(label, color, 8);
    y = drawFirmDetails(y + 2, color, 18);
    y = drawBillMeta(y + 2);
    y = drawItemsTable(y, color);
    y = drawTotalsBank(y, color);
    drawFooter(y + 2);
    // Duplicate copy — Received By section
    if (isDuplicate) {
      const ry = y + 18;
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
      doc.line(M, ry, M + fw, ry);
      doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text("Received By: _______________________", M, ry + 8);
      doc.text("Date: _______________________", M, ry + 16);
      doc.text("Stamp & Sign: _______________________", M, ry + 24);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text("(Sign & Return this copy to Kushaan Packers)", M + fw - 2, ry + 8, { align: "right" });
    }
  };

  let y = drawHeader("ORIGINAL  (Buyer's Copy)", [26, 92, 56], 8);
  y = drawFirmDetails(y + 2, [26, 92, 56], 18);
  y = drawBillMeta(y + 2);
  y = drawItemsTable(y, [26, 92, 56]);
  y = drawTotalsBank(y, [26, 92, 56]);
  drawFooter(y + 2);

  doc.addPage();
  drawShortCopy("DUPLICATE  (Receiver's Copy — Sign & Return)", [30, 58, 138]);

  doc.addPage();
  drawShortCopy("TRIPLICATE  (Office / Proof Copy)", [124, 45, 18]);

  const pdfOutput = doc.output("datauristring");
  const a = document.createElement("a");
  a.href = pdfOutput;
  a.download = `Invoice_${sale.invoiceNo || "KP"}.pdf`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================
// ACCOUNT STATEMENT PDF
// ============================================================
function generateStatementPDF(party, type, invoices) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210; const M = 12; const fw = W - M * 2;
  doc.setFillColor(15, 40, 90);
  doc.rect(M - 1, 7, fw + 2, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("ACCOUNT STATEMENT", W / 2, 15, { align: "center" });
  let y = 24;
  doc.setTextColor(15, 40, 90); doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Kushaan Packers", M, y);
  doc.setTextColor(60, 60, 60); doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
  y += 5; doc.text("GSTIN: 06ACQPL0313F1ZY | Ph: 9896556789 / 9896412626", M, y);
  y += 4; doc.text("Shed No.2, Near Tata Motor Service Station, Panipat, Haryana - 132103", M, y);
  y += 6;
  doc.setFillColor(235, 241, 255);
  doc.rect(M, y, fw, 20, "F");
  doc.setDrawColor(15, 40, 90); doc.setLineWidth(0.3);
  doc.rect(M, y, fw, 20);
  doc.setTextColor(15, 40, 90); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(type === "customer" ? "CUSTOMER DETAILS" : "SUPPLIER DETAILS", M + 3, y + 6);
  doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(`Name   : ${party.name}`, M + 3, y + 12);
  doc.text(`GSTIN  : ${party.gstin || "N/A"}`, M + 3, y + 17);
  doc.text(`Date   : ${new Date().toLocaleDateString("en-IN")}`, M + fw / 2, y + 12);
  doc.text(`Type   : ${type === "customer" ? "Receivable (Lena)" : "Payable (Dena)"}`, M + fw / 2, y + 17);
  y += 24;
  const tableRows = invoices.map(inv => {
    const balance = type === "customer" ? (inv.amount - (inv.received || 0)).toFixed(2) : inv.amount.toFixed(2);
    return [inv.date, inv.invoiceNo, `Rs.${inv.amount.toFixed(2)}`, type === "customer" ? `Rs.${(inv.received || 0).toFixed(2)}` : "-", `Rs.${balance}`, inv.status];
  });
  const headers = type === "customer"
    ? [["Date", "Invoice No.", "Billed Amount", "Amount Received", "Balance", "Status"]]
    : [["Date", "Invoice No.", "Purchase Amount", "-", "Outstanding", "Status"]];
  autoTable(doc, {
    startY: y, head: headers, body: tableRows, theme: "grid",
    headStyles: { fillColor: [15, 40, 90], textColor: 255, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    columnStyles: { 0:{cellWidth:25},1:{cellWidth:35},2:{halign:"right",cellWidth:32},3:{halign:"right",cellWidth:32},4:{halign:"right",cellWidth:32,fontStyle:"bold"},5:{cellWidth:24} },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 4;
  const totalBilled = invoices.reduce((s, i) => s + i.amount, 0);
  const totalReceived = type === "customer" ? invoices.reduce((s, i) => s + (i.received || 0), 0) : 0;
  const outstanding = totalBilled - totalReceived;
  doc.setFillColor(15, 40, 90);
  doc.rect(M + fw / 2, y, fw / 2, 8, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("TOTAL OUTSTANDING", M + fw / 2 + 3, y + 5.5);
  doc.text(`Rs.${outstanding.toFixed(2)}`, M + fw - 2, y + 5.5, { align: "right" });
  doc.save(`Statement_${party.name.replace(/ /g, "_")}.pdf`);
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [nextSaleNo, setNextSaleNo] = useState(36);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [nextOrderNo, setNextOrderNo] = useState(1);
  const [prefilledOrder, setPrefilledOrder] = useState(null);
  const FY = getFinancialYear();

  useEffect(() => {
    const q = query(collection(db, "sales"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "purchases"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "parties"), orderBy("partyName", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setParties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const counterRef = doc(db, "meta", "orderCounter");
    const unsub = onSnapshot(counterRef, (snap) => {
      if (snap.exists()) setNextOrderNo(snap.data().next || 1);
      else setDoc(counterRef, { next: 1 });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const counterRef = doc(db, "meta", "invoiceCounter");
    const unsub = onSnapshot(counterRef, (snap) => {
      if (snap.exists()) {
        setNextSaleNo(snap.data().next || 36);
      } else {
        setDoc(counterRef, { next: 36 });
      }
    });
    return unsub;
  }, []);

  const deleteSale = async (saleId, invoiceNo) => {
    if (!window.confirm(`Cancel invoice ${invoiceNo}?`)) return;
    await deleteDoc(doc(db, "sales", saleId));
    const counterRef = doc(db, "meta", "invoiceCounter");
    const snap = await getDoc(counterRef);
    if (snap.exists() && snap.data().next > 36) {
      await updateDoc(counterRef, { next: snap.data().next - 1 });
    }
  };

  const deletePurchase = async (purchaseId, invoiceNo) => {
    if (!window.confirm(`Delete purchase ${invoiceNo}?`)) return;
    await deleteDoc(doc(db, "purchases", purchaseId));
  };

  const addOrder = async (formData) => {
    const orderNo = `KP-ORD-${FY}-${String(nextOrderNo).padStart(3, "0")}`;
    await addDoc(collection(db, "orders"), {
      orderNo,
      orderNumber: nextOrderNo,
      orderDate: formData.orderDate,
      deliveryDate: formData.deliveryDate,
      customerName: formData.customerName,
      customerGstin: formData.customerGstin || "",
      customerAddress: formData.customerAddress || "",
      deliveryAddress: formData.deliveryAddress || "",
      selectedPartyId: formData.selectedPartyId || "",
      items: formData.items || [],
      specialInstructions: formData.specialInstructions || "",
      status: "Pending",
      createdAt: serverTimestamp(),
    });
    const counterRef = doc(db, "meta", "orderCounter");
    await updateDoc(counterRef, { next: nextOrderNo + 1 });
  };

  const deleteOrder = async (orderId, orderNo) => {
    if (!window.confirm(`Delete order ${orderNo}?`)) return;
    await deleteDoc(doc(db, "orders", orderId));
  };

  const markOrderBilled = async (orderId) => {
    await updateDoc(doc(db, "orders", orderId), { status: "Billed" });
  };

  const convertOrderToSale = (order) => {
    setPrefilledOrder(order);
    setTab("sale");
  };

  const addSale = async (formData) => {
    const taxable = parseFloat(formData.taxable);
    const cgst = parseFloat((taxable * 0.025).toFixed(2));
    const sgst = parseFloat((taxable * 0.025).toFixed(2));
    const total = parseFloat((taxable + cgst + sgst).toFixed(2));
    const invoiceNo = `KP/${FY}/${String(nextSaleNo).padStart(3, "0")}`;
    await addDoc(collection(db, "sales"), {
      invoiceNo, invoiceNumber: nextSaleNo,
      date: formData.date, customerName: formData.customerName,
      customerGstin: formData.customerGstin || "",
      customerAddress: formData.customerAddress || "",
      deliveryAddress: formData.deliveryAddress || "",
      description: formData.description || "Corrugated Box",
      hsnCode: formData.hsnCode || "4819",
      quantity: parseFloat(formData.quantity),
      unit: formData.unit || "PCS",
      rate: parseFloat(formData.rate),
      taxableValue: taxable, cgstAmount: cgst, sgstAmount: sgst, totalAmount: total,
      vehicleNo: formData.vehicleNo || "",
      ewayBillNo: formData.ewayBillNo || "",
      poNo: formData.poNo || "",
      lineItems: formData.lineItems || [],
      status: "Outstanding",
      paymentTerms: parseInt(formData.paymentTerms) || 30,
      dueDate: (() => { const d = new Date(formData.date); d.setDate(d.getDate() + (parseInt(formData.paymentTerms) || 30)); return d.toISOString().split("T")[0]; })(),
      createdAt: serverTimestamp(),
    });
    const counterRef = doc(db, "meta", "invoiceCounter");
    await updateDoc(counterRef, { next: nextSaleNo + 1 });
  };

  const addPurchase = async (formData) => {
    const taxable = parseFloat(formData.taxable);
    const gstRate = parseFloat(formData.gstRate) || 18;
    const halfRate = gstRate / 2 / 100;
    const cgst = parseFloat((taxable * halfRate).toFixed(2));
    const sgst = parseFloat((taxable * halfRate).toFixed(2));
    const total = parseFloat((taxable + cgst + sgst).toFixed(2));
    const itc = parseFloat((cgst + sgst).toFixed(2));
    await addDoc(collection(db, "purchases"), {
      invoiceNo: formData.invoiceNo, date: formData.date,
      supplierName: formData.supplierName,
      supplierGstin: formData.supplierGstin || "",
      gstRate: gstRate,
      taxableValue: taxable, cgstAmount: cgst, sgstAmount: sgst,
      totalAmount: total, itcAmount: itc,
      createdAt: serverTimestamp(),
    });
  };

  const totalSalesTaxable = sales.reduce((s, r) => s + (r.taxableValue || 0), 0);
  const totalOutputTax = sales.reduce((s, r) => s + (r.cgstAmount || 0) + (r.sgstAmount || 0), 0);
  const totalITC = purchases.reduce((s, r) => s + (r.itcAmount || 0), 0);
  const taxGap = totalITC - totalOutputTax;
  const refundAmount = Math.max(0, taxGap);

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingBox}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📦</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f97316" }}>Kushaan Packers ERP</div>
          <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>Loading data...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>📦</div>
          <div>
            <div style={styles.firmName}>{FIRM.name}</div>
            <div style={styles.firmSub}>GSTIN: {FIRM.gstin} | GST-Flow ERP</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.badgePurple}>Purchase @18%</span>
          <span style={styles.badgeBlue}>Sale @5%</span>
          <span style={styles.badgeGreen}>IDS Refund Active</span>
        </div>
      </div>
      <div style={styles.tabBar}>
        {[
          { id: "dashboard", label: "📊 Dashboard" },
          { id: "sale", label: "📦 New Sale" },
          { id: "purchase", label: "🛒 New Purchase" },
          { id: "sales-list", label: "📋 Sales List" },
          { id: "purchases-list", label: "🗒️ Purchase List" },
          { id: "parties", label: "🏢 Party Master" },
          { id: "ledger", label: "📒 Ledger" },
          { id: "refund", label: "💰 GST Refund" },
          { id: "orders", label: "📋 Order Book" },
          { id: "payments", label: "💳 Payments" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? styles.tabActive : styles.tab}>{t.label}</button>
        ))}
      </div>
      <div style={styles.content}>
        {tab === "dashboard" && <Dashboard sales={sales} purchases={purchases} totalSalesTaxable={totalSalesTaxable} totalOutputTax={totalOutputTax} totalITC={totalITC} taxGap={taxGap} refundAmount={refundAmount} nextSaleNo={nextSaleNo} FY={FY} />}
        {tab === "sale" && <SaleForm onSubmit={addSale} nextSaleNo={nextSaleNo} FY={FY} setTab={setTab} parties={parties} prefilledOrder={prefilledOrder} clearPrefilled={() => setPrefilledOrder(null)} />}
        {tab === "parties" && <PartyMaster parties={parties} />}
        {tab === "ledger" && <LedgerTab sales={sales} purchases={purchases} parties={parties} />}
        {tab === "purchase" && <PurchaseForm onSubmit={addPurchase} setTab={setTab} />}
        {tab === "sales-list" && <SalesList sales={sales} deleteSale={deleteSale} />}
        {tab === "purchases-list" && <PurchasesList purchases={purchases} deletePurchase={deletePurchase} />}
        {tab === "payments" && <PaymentsTab sales={sales} />
        }
        {tab === "orders" && <OrderBook orders={orders} nextOrderNo={nextOrderNo} FY={FY} parties={parties} addOrder={addOrder} deleteOrder={deleteOrder} convertOrderToSale={convertOrderToSale} setTab={setTab} />}
        {tab === "refund" && <RefundTab totalSalesTaxable={totalSalesTaxable} totalOutputTax={totalOutputTax} totalITC={totalITC} taxGap={taxGap} refundAmount={refundAmount} />}
      </div>
    </div>
  );
}

function Dashboard({ sales, purchases, totalSalesTaxable, totalOutputTax, totalITC, taxGap, refundAmount, nextSaleNo, FY }) {
  const [period, setPeriod] = useState("all"); // "all" | "month" | "year"
  const todayStr = today();
  const currentMonth = todayStr.slice(0, 7); // "2026-05"
  const currentYear = todayStr.slice(0, 4);  // "2026"

  const filterByPeriod = (arr) => {
    if (period === "month") return arr.filter(r => (r.date || "").startsWith(currentMonth));
    if (period === "year") return arr.filter(r => (r.date || "").startsWith(currentYear));
    return arr;
  };

  const fSales = filterByPeriod(sales);
  const fPurchases = filterByPeriod(purchases);
  const fTaxable = fSales.reduce((s, r) => s + (r.taxableValue || 0), 0);
  const fOutputTax = fSales.reduce((s, r) => s + (r.cgstAmount || 0) + (r.sgstAmount || 0), 0);
  const fITC = fPurchases.reduce((s, r) => s + (r.itcAmount || 0), 0);
  const fTaxGap = fITC - fOutputTax;
  const fRefund = Math.max(0, fTaxGap);

  const periodLabels = { all: "All Time", month: "This Month", year: "This Year" };

  return (
    <div style={styles.section}>
      {/* Period Filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["all", "month", "year"].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: period === p ? "#3b82f6" : "#1a1d27",
            color: period === p ? "#fff" : "#64748b",
            border: period === p ? "1px solid #3b82f6" : "1px solid #2a2d3a",
          }}>{periodLabels[p]}</button>
        ))}
        <span style={{ color: "#64748b", fontSize: 12, alignSelf: "center" }}>
          {period === "month" ? `📅 ${currentMonth}` : period === "year" ? `📅 FY ${currentYear}` : ""}
        </span>
      </div>
      {fTaxGap > 0 && <div style={styles.alertGreen}>✅ <strong>ITC Surplus!</strong> Refund due: {formatINR(fTaxGap)} — File under Rule 89(5).</div>}
      <div style={styles.grid4}>
        <StatCard label="Total Sales (Taxable)" value={formatINR(fTaxable)} sub={`Output Tax: ${formatINR(fOutputTax)}`} color="#3b82f6" icon="📦" />
        <StatCard label="Total ITC Available" value={formatINR(fITC)} sub="From purchases" color="#a855f7" icon="🛒" />
        <StatCard label="Net ITC Surplus" value={formatINR(fTaxGap)} sub="Refund eligible" color="#22c55e" icon="💰" />
        <StatCard label="Rule 89(5) Refund" value={formatINR(fRefund)} sub="Maximum refund" color="#f97316" icon="📋" />
      </div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>GST Position — Inverted Duty Structure</div>
        <div style={styles.grid3}>
          <div style={{ ...styles.posBox, borderColor: "#ef4444" }}><div style={{ color: "#94a3b8", fontSize: 12 }}>Output Tax (5%)</div><div style={{ color: "#ef4444", fontSize: 22, fontWeight: 800 }}>{formatINR(fOutputTax)}</div></div>
          <div style={{ ...styles.posBox, borderColor: "#22c55e" }}><div style={{ color: "#94a3b8", fontSize: 12 }}>ITC Available</div><div style={{ color: "#22c55e", fontSize: 22, fontWeight: 800 }}>{formatINR(fITC)}</div></div>
          <div style={{ ...styles.posBox, borderColor: "#f97316" }}><div style={{ color: "#94a3b8", fontSize: 12 }}>Net Surplus</div><div style={{ color: "#f97316", fontSize: 22, fontWeight: 800 }}>{formatINR(fTaxGap)}</div></div>
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Next Invoice Number</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#f97316", fontFamily: "monospace" }}>KP/{FY}/{String(nextSaleNo).padStart(3, "0")}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>Auto-assigned — shared between all devices</div>
      </div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Recent Sales</div>
        {fSales.slice(0, 5).map(s => (
          <div key={s.id} style={styles.listRow}>
            <div><div style={{ color: "#f97316", fontWeight: 700 }}>{s.invoiceNo}</div><div style={{ color: "#94a3b8", fontSize: 12 }}>{s.customerName} | {s.date}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ color: "#22c55e", fontWeight: 700 }}>{formatINR(s.totalAmount)}</div><div style={{ color: "#94a3b8", fontSize: 11 }}>{s.status}</div></div>
          </div>
        ))}
        {sales.length === 0 && <div style={{ color: "#94a3b8" }}>No sales yet.</div>}
      </div>
    </div>
  );
}

// ============================================================
// BOX RATE CALCULATOR — Industry Formula
// Sheet Width  = (L + B + 5) / 2.54
// Sheet Length = (B + H) / 2.54
// Rate/box     = Width × Length × Rate per sq inch
// Total        = Rate/box × Qty
// ============================================================
function calcBoxRate(item) {
  const L = parseFloat(item.length) || 0;
  const B = parseFloat(item.breadth) || 0;
  const H = parseFloat(item.height) || 0;
  const rsi = parseFloat(item.ratePerSqInch) || 0;
  const qty = parseFloat(item.quantity) || 0;
  if (!L || !B || !H || !rsi) return { ratePerBox: 0, taxable: "0.00", valid: false };
  const sheetWidth = (L + B + 5) / 2.54;
  const sheetLength = (B + H) / 2.54;
  const ratePerBox = Math.round(sheetWidth * sheetLength * rsi * 100) / 100;
  return { ratePerBox, taxable: (ratePerBox * qty).toFixed(2), valid: true };
}

const EMPTY_ITEM = () => ({
  id: Date.now() + Math.random(),
  productType: "Corrugated Box",
  ply: "3 Ply",
  description: "Corrugated Box",
  hsnCode: "4819",
  length: "", breadth: "", height: "",
  quantity: "", unit: "PCS",
  rateMode: "perPiece",
  rate: "",
  ratePerSqInch: "",
  taxable: "",
  // Printing
  printing: false,
  printingColors: "1 Color",
  printingSides: "1 Side",
  printingRateType: "perSide",  // "perSide" | "perBox"
  printingRate: "",
  printingTaxable: "0",
});

function calcPrintingTaxable(item) {
  if (!item.printing || !item.printingRate) return 0;
  const qty = parseFloat(item.quantity) || 0;
  const rate = parseFloat(item.printingRate) || 0;
  const sides = parseInt(item.printingSides) || 1;
  if (item.printingRateType === "perSide") return parseFloat((rate * sides * qty).toFixed(2));
  return parseFloat((rate * qty).toFixed(2));
}

function SaleForm({ onSubmit, nextSaleNo, FY, setTab, parties, prefilledOrder, clearPrefilled }) {
  const [header, setHeader] = useState(() => prefilledOrder ? {
    date: today(), customerName: prefilledOrder.customerName || "", customerGstin: prefilledOrder.customerGstin || "",
    customerAddress: prefilledOrder.customerAddress || "", deliveryAddress: "", vehicleNo: "", ewayBillNo: "", poNo: "", selectedPartyId: prefilledOrder.selectedPartyId || "",
    paymentTerms: "30"
  } : { date: today(), customerName: "", customerGstin: "", customerAddress: "", deliveryAddress: "", vehicleNo: "", ewayBillNo: "", poNo: "", selectedPartyId: "", paymentTerms: "30" });
  const [items, setItems] = useState(() => prefilledOrder && prefilledOrder.items && prefilledOrder.items.length > 0
    ? prefilledOrder.items.map(i => ({ ...i, id: Date.now() + Math.random(), taxable: "" }))
    : [EMPTY_ITEM()]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const setH = (k, v) => setHeader(p => ({ ...p, [k]: v }));

  const handlePartySelect = (partyId) => {
    if (!partyId || partyId === "__new__") { setHeader(p => ({ ...p, selectedPartyId: "", customerName: "", customerGstin: "", customerAddress: "" })); return; }
    const party = parties.find(p => p.id === partyId);
    if (party) setHeader(p => ({ ...p, selectedPartyId: partyId, customerName: party.partyName || "", customerGstin: party.gstin || "", customerAddress: party.address || "" }));
  };

  const setItem = (id, k, v) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [k]: v };
      // Auto-update description when productType or ply changes
      if (k === "productType" || k === "ply") {
        const pt = k === "productType" ? v : item.productType;
        const pl = k === "ply" ? v : item.ply;
        updated.description = `${pt} ${pl}`;
        if (pt !== "Corrugated Box") updated.height = "";
      }
      // Recalculate box taxable
      let boxTaxable = 0;
      if (updated.rateMode === "perSqInch") {
        const calc = calcBoxRate(updated);
        boxTaxable = parseFloat(calc.taxable) || 0;
      } else {
        const qty = parseFloat(updated.quantity) || 0;
        const rate = parseFloat(updated.rate) || 0;
        boxTaxable = parseFloat((qty * rate).toFixed(2));
      }
      // Recalculate printing taxable
      const printTax = calcPrintingTaxable(updated);
      updated.printingTaxable = printTax.toFixed(2);
      updated.taxable = (boxTaxable + printTax).toFixed(2);
      return updated;
    }));
  };

  const toggleRateMode = (id, mode) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, rateMode: mode, taxable: "0.00" };
      return updated;
    }));
  };

  const totalTaxable = items.reduce((s, i) => s + (parseFloat(i.taxable) || 0), 0);
  const totalCGST = parseFloat((totalTaxable * 0.025).toFixed(2));
  const totalSGST = parseFloat((totalTaxable * 0.025).toFixed(2));
  const grandTotal = parseFloat((totalTaxable + totalCGST + totalSGST).toFixed(2));
  const invoiceNo = `KP/${FY}/${String(nextSaleNo).padStart(3, "0")}`;

  const handleSubmit = async () => {
    if (!header.customerName || totalTaxable === 0 || !header.date) return;
    setSaving(true);
    const lineItems = items.filter(i => parseFloat(i.taxable) > 0).map((i, idx) => {
      const rateInBill = i.rateMode === "perSqInch"
        ? parseFloat(calcBoxRate(i).ratePerBox.toFixed(4))
        : parseFloat(i.rate) || 0;
      const printDesc = i.printing ? ` + ${i.printingColors} ${i.printingSides} Printing` : "";
      return {
        srNo: idx + 1,
        description: (i.description || "Corrugated Box") + printDesc,
        hsnCode: i.hsnCode,
        size: (i.length && i.breadth) ? `${i.length}x${i.breadth}${i.height ? "x" + i.height : ""}` : "",
        quantity: parseFloat(i.quantity) || 0,
        unit: i.unit,
        rate: rateInBill,
        taxable: parseFloat(i.taxable) || 0,
        cgst: parseFloat((parseFloat(i.taxable) * 0.025).toFixed(2)),
        sgst: parseFloat((parseFloat(i.taxable) * 0.025).toFixed(2)),
        total: parseFloat((parseFloat(i.taxable) * 1.05).toFixed(2)),
        printing: i.printing || false,
        printingColors: i.printingColors || "",
        printingSides: i.printingSides || "",
        printingRate: i.printingRate || "",
        printingRateType: i.printingRateType || "",
        printingTaxable: parseFloat(i.printingTaxable) || 0,
      };
    });
    await onSubmit({ ...header, lineItems, taxable: totalTaxable.toString() });
    setSaving(false); setSuccess(true);
    setTimeout(() => { setSuccess(false); setTab("sales-list"); }, 1500);
  };

  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>New Sale — Invoice: <span style={{ color: "#f97316" }}>{invoiceNo}</span></div>
        {parties.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={styles.label}>Select Party 🏢</label>
            <select style={{ ...styles.input, marginTop: 6 }} value={header.selectedPartyId} onChange={e => handlePartySelect(e.target.value)}>
              <option value="">-- Select party --</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.partyName} {p.gstin ? "| " + p.gstin : ""}</option>)}
              <option value="__new__">+ New Party</option>
            </select>
          </div>
        )}
        <div style={styles.grid2}>
          <Field label="Invoice No." value={invoiceNo} readOnly />
          <Field label="Date" type="date" value={header.date} onChange={v => setH("date", v)} />
          <Field label="Customer Name *" value={header.customerName} onChange={v => setH("customerName", v)} placeholder="Customer name" />
          <Field label="Customer GSTIN" value={header.customerGstin} onChange={v => setH("customerGstin", v)} placeholder="Optional" />
          <Field label="Billing Address" value={header.customerAddress || ""} onChange={v => setH("customerAddress", v)} placeholder="Registered address" />
          <Field label="Delivery Address (Ship To)" value={header.deliveryAddress || ""} onChange={v => setH("deliveryAddress", v)} placeholder="Agar alag ho toh daalo" />
        </div>

        {/* ── ITEMS TABLE ── */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: "#f1f5f9", fontWeight: 700 }}>📋 Items</div>
            <button onClick={() => setItems(p => [...p, EMPTY_ITEM()])} style={styles.btnAdd}>+ Add Item</button>
          </div>

          {items.map((item, idx) => {
            const isSqInch = item.rateMode === "perSqInch";
            const sqCalc = isSqInch ? calcBoxRate(item) : null;
            return (
              <div key={item.id} style={styles.itemCard}>
                {/* Row 1: Sr + Product Type + Ply + HSN + Remove */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ color: "#f97316", fontWeight: 800, fontSize: 14, minWidth: 24 }}>{idx + 1}</div>
                  {/* Product Type */}
                  <select
                    style={{ ...styles.itemInput, width: 150 }}
                    value={item.productType}
                    onChange={e => setItem(item.id, "productType", e.target.value)}
                  >
                    <option>Corrugated Box</option>
                    <option>Stiffener</option>
                    <option>Sheet</option>
                  </select>
                  {/* Ply */}
                  <select
                    style={{ ...styles.itemInput, width: 90 }}
                    value={item.ply}
                    onChange={e => setItem(item.id, "ply", e.target.value)}
                  >
                    <option>3 Ply</option>
                    <option>5 Ply</option>
                    <option>7 Ply</option>
                  </select>
                  {/* Custom description override */}
                  <input
                    style={{ ...styles.itemInput, flex: 1, minWidth: 120 }}
                    value={item.description}
                    onChange={e => setItem(item.id, "description", e.target.value)}
                    placeholder="Description (auto)"
                  />
                  <input
                    style={{ ...styles.itemInput, width: 60 }}
                    value={item.hsnCode}
                    onChange={e => setItem(item.id, "hsnCode", e.target.value)}
                    placeholder="HSN"
                  />
                  {items.length > 1 && (
                    <button onClick={() => setItems(p => p.filter(i => i.id !== item.id))} style={styles.btnRemove}>✕</button>
                  )}
                </div>

                {/* Row 2: L × B × H + Qty + Unit */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>
                      {item.productType === "Corrugated Box" ? "L×B×H (inch):" : "L×B (inch):"}
                    </span>
                    <input style={{ ...styles.itemInput, width: 52, textAlign: "center" }} type="number" value={item.length} onChange={e => setItem(item.id, "length", e.target.value)} placeholder="L" />
                    <span style={{ color: "#475569" }}>×</span>
                    <input style={{ ...styles.itemInput, width: 52, textAlign: "center" }} type="number" value={item.breadth} onChange={e => setItem(item.id, "breadth", e.target.value)} placeholder="B" />
                    {item.productType === "Corrugated Box" && (<>
                      <span style={{ color: "#475569" }}>×</span>
                      <input style={{ ...styles.itemInput, width: 52, textAlign: "center" }} type="number" value={item.height} onChange={e => setItem(item.id, "height", e.target.value)} placeholder="H" />
                    </>)}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Qty:</span>
                    <input style={{ ...styles.itemInput, width: 72 }} type="number" value={item.quantity} onChange={e => setItem(item.id, "quantity", e.target.value)} placeholder="100" />
                    <select style={{ ...styles.itemInput, width: 68 }} value={item.unit} onChange={e => setItem(item.id, "unit", e.target.value)}>
                      {["PCS", "KG", "MTR", "LTR", "BOX"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 3: Rate Mode — per item toggle, only one field shows */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>

                  {/* Mode toggle — per item */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Rate Mode:</span>
                    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                      <button
                        onClick={() => toggleRateMode(item.id, "perPiece")}
                        style={{
                          padding: "7px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                          background: !isSqInch ? "#f97316" : "#0f1117",
                          color: !isSqInch ? "#fff" : "#64748b",
                        }}
                      >₹/Piece</button>
                      <button
                        onClick={() => toggleRateMode(item.id, "perSqInch")}
                        style={{
                          padding: "7px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                          background: isSqInch ? "#3b82f6" : "#0f1117",
                          color: isSqInch ? "#fff" : "#64748b",
                        }}
                      >₹/Sq.In</button>
                    </div>
                  </div>

                  {/* Rate input — only active mode shows */}
                  {!isSqInch ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ color: "#64748b", fontSize: 11 }}>Rate (₹/piece):</span>
                      <input
                        style={{ ...styles.itemInput, width: 120, border: "1px solid #f97316" }}
                        type="number"
                        value={item.rate}
                        onChange={e => setItem(item.id, "rate", e.target.value)}
                        placeholder="200"
                      />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ color: "#64748b", fontSize: 11 }}>Rate (₹/sq.inch):</span>
                      <input
                        style={{ ...styles.itemInput, width: 120, border: "1px solid #3b82f6" }}
                        type="number"
                        value={item.ratePerSqInch}
                        onChange={e => setItem(item.id, "ratePerSqInch", e.target.value)}
                        placeholder="0.045"
                        step="0.001"
                      />
                      {sqCalc && sqCalc.valid && (
                        <div style={{ background: "#0a1f3a", border: "1px solid #3b82f644", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
                          <span style={{ color: "#64748b" }}>= </span>
                          <span style={{ color: "#60a5fa", fontWeight: 700 }}>₹{sqCalc.ratePerBox.toFixed(2)}/box</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Taxable */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Taxable (₹):</span>
                    <input
                      style={{ ...styles.itemInput, width: 120, color: "#22c55e", fontWeight: 700 }}
                      type="number"
                      value={item.taxable}
                      onChange={e => setItem(item.id, "taxable", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Row 4: Printing */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #2a2d3a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: item.printing ? 8 : 0 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>🖨️ Printing:</span>
                    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                      <button onClick={() => setItem(item.id, "printing", false)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: !item.printing ? "#475569" : "#0f1117", color: !item.printing ? "#fff" : "#64748b" }}>No</button>
                      <button onClick={() => setItem(item.id, "printing", true)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: item.printing ? "#a855f7" : "#0f1117", color: item.printing ? "#fff" : "#64748b" }}>Yes</button>
                    </div>
                    {item.printing && <span style={{ color: "#a855f7", fontSize: 11 }}>Printing Taxable: ₹{item.printingTaxable || "0"}</span>}
                  </div>
                  {item.printing && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      {/* Colors */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ color: "#64748b", fontSize: 11 }}>Colors:</span>
                        <select style={{ ...styles.itemInput, width: 100 }} value={item.printingColors} onChange={e => setItem(item.id, "printingColors", e.target.value)}>
                          <option>1 Color</option><option>2 Color</option><option>3 Color</option><option>4 Color</option>
                        </select>
                      </div>
                      {/* Sides */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ color: "#64748b", fontSize: 11 }}>Sides:</span>
                        <select style={{ ...styles.itemInput, width: 90 }} value={item.printingSides} onChange={e => setItem(item.id, "printingSides", e.target.value)}>
                          <option>1 Side</option><option>2 Side</option><option>3 Side</option><option>4 Side</option>
                        </select>
                      </div>
                      {/* Rate Type */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ color: "#64748b", fontSize: 11 }}>Rate Type:</span>
                        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                          <button onClick={() => setItem(item.id, "printingRateType", "perSide")} style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: item.printingRateType === "perSide" ? "#a855f7" : "#0f1117", color: item.printingRateType === "perSide" ? "#fff" : "#64748b" }}>Per Side</button>
                          <button onClick={() => setItem(item.id, "printingRateType", "perBox")} style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: item.printingRateType === "perBox" ? "#a855f7" : "#0f1117", color: item.printingRateType === "perBox" ? "#fff" : "#64748b" }}>Per Box</button>
                        </div>
                      </div>
                      {/* Printing Rate */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ color: "#64748b", fontSize: 11 }}>Printing Rate (₹):</span>
                        <input style={{ ...styles.itemInput, width: 110, border: "1px solid #a855f7" }} type="number" value={item.printingRate} onChange={e => setItem(item.id, "printingRate", e.target.value)} placeholder="0.50" step="0.25" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {totalTaxable > 0 && (
            <div style={styles.taxPreview}>
              <div style={styles.grid4}>
                <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>Taxable</div><div style={{ color: "#3b82f6", fontWeight: 700 }}>{formatINR(totalTaxable)}</div></div>
                <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>CGST 2.5%</div><div style={{ color: "#f97316", fontWeight: 700 }}>{formatINR(totalCGST)}</div></div>
                <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>SGST 2.5%</div><div style={{ color: "#f97316", fontWeight: 700 }}>{formatINR(totalSGST)}</div></div>
                <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>Grand Total</div><div style={{ color: "#22c55e", fontWeight: 800, fontSize: 18 }}>{formatINR(grandTotal)}</div></div>
              </div>
            </div>
          )}
        </div>

        {/* Transport */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #2a2d3a" }}>
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>TRANSPORT DETAILS</div>
          <div style={styles.grid2}>
            <Field label="Vehicle No." value={header.vehicleNo} onChange={v => setH("vehicleNo", v)} placeholder="HR 06 AB 1234" />
            <Field label="E-Way Bill No." value={header.ewayBillNo} onChange={v => setH("ewayBillNo", v)} placeholder="041426XXXXXXXXX" />
            <Field label="PO Number" value={header.poNo} onChange={v => setH("poNo", v)} placeholder="PO-2026-001" />
          </div>
        </div>
        {/* Payment Terms */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #2a2d3a" }}>
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>💳 PAYMENT TERMS <span style={{ color: "#475569", fontSize: 11 }}>(Invoice pe nahi dikhega)</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["15", "30", "45", "60", "90"].map(days => (
              <button key={days} onClick={() => setH("paymentTerms", days)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                  background: header.paymentTerms === days ? "#22c55e" : "#0f1117",
                  color: header.paymentTerms === days ? "#fff" : "#64748b",
                  border: header.paymentTerms === days ? "1px solid #22c55e" : "1px solid #2a2d3a",
                }}>{days} Days</button>
            ))}
            <input
              type="number"
              placeholder="Custom days"
              style={{ ...styles.input, width: 120 }}
              value={["15","30","45","60","90"].includes(header.paymentTerms) ? "" : header.paymentTerms}
              onChange={e => setH("paymentTerms", e.target.value)}
            />
          </div>
          {header.paymentTerms && header.date && (
            <div style={{ marginTop: 8, color: "#22c55e", fontSize: 12 }}>
              📅 Due Date: <strong>{(() => { const d = new Date(header.date); d.setDate(d.getDate() + parseInt(header.paymentTerms || 0)); return d.toLocaleDateString("en-IN"); })()}</strong>
            </div>
          )}
        </div>
        <button onClick={handleSubmit} disabled={saving || success} style={styles.btnPrimary}>
          {success ? "✅ Saved!" : saving ? "Saving..." : `💾 Save Invoice (${formatINR(grandTotal)})`}
        </button>
      </div>
    </div>
  );
}

function PurchaseForm({ onSubmit, setTab }) {
  const [form, setForm] = useState({ invoiceNo: "", date: today(), supplierName: "", supplierGstin: "", taxable: "", gstRate: "18" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleSubmit = async () => {
    if (!form.supplierName || !form.taxable || !form.invoiceNo) return;
    setSaving(true); await onSubmit(form); setSaving(false); setSuccess(true);
    setTimeout(() => { setSuccess(false); setTab("purchases-list"); }, 1500);
  };
  const taxable = parseFloat(form.taxable) || 0;
  const gstRate = parseFloat(form.gstRate) || 18;
  const halfRate = gstRate / 2;
  const cgst = parseFloat((taxable * halfRate / 100).toFixed(2));
  const sgst = parseFloat((taxable * halfRate / 100).toFixed(2));
  const gstRates = ["5", "12", "18", "28"];
  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>New Purchase</div>
        <div style={styles.grid2}>
          <Field label="Supplier Invoice No. *" value={form.invoiceNo} onChange={v => set("invoiceNo", v)} placeholder="SUP-INV-001" />
          <Field label="Date" type="date" value={form.date} onChange={v => set("date", v)} />
          <Field label="Supplier Name *" value={form.supplierName} onChange={v => set("supplierName", v)} placeholder="Paper Mill India Ltd." />
          <Field label="Supplier GSTIN *" value={form.supplierGstin} onChange={v => set("supplierGstin", v)} placeholder="27XXXXX1234X1ZX" />
          <Field label="Taxable Value (₹) *" type="number" value={form.taxable} onChange={v => set("taxable", v)} placeholder="50000" />
          {/* GST Rate Selector */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>GST Rate *</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {gstRates.map(rate => (
                <button key={rate} onClick={() => set("gstRate", rate)}
                  style={{ flex: 1, padding: "10px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
                    background: form.gstRate === rate ? "#a855f7" : "#0f1117",
                    color: form.gstRate === rate ? "#fff" : "#64748b",
                    border: form.gstRate === rate ? "1px solid #a855f7" : "1px solid #2a2d3a",
                  }}>{rate}%</button>
              ))}
            </div>
          </div>
        </div>
        {taxable > 0 && (
          <div style={styles.taxPreview}>
            <div style={styles.grid4}>
              <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>Taxable</div><div style={{ color: "#3b82f6", fontWeight: 700 }}>{formatINR(taxable)}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>CGST {halfRate}%</div><div style={{ color: "#a855f7", fontWeight: 700 }}>{formatINR(cgst)}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>SGST {halfRate}%</div><div style={{ color: "#a855f7", fontWeight: 700 }}>{formatINR(sgst)}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ color: "#94a3b8", fontSize: 11 }}>Total ITC</div><div style={{ color: "#22c55e", fontWeight: 800 }}>{formatINR(cgst + sgst)}</div></div>
            </div>
          </div>
        )}
        <button onClick={handleSubmit} disabled={saving || success} style={{ ...styles.btnPrimary, background: "#a855f7" }}>
          {success ? "✅ Saved!" : saving ? "Saving..." : `💾 Save Purchase (GST ${gstRate}%)`}
        </button>
      </div>
    </div>
  );
}

function SalesList({ sales, deleteSale }) {
  const totalTaxable = sales.reduce((s, r) => s + (r.taxableValue || 0), 0);
  const totalTax = sales.reduce((s, r) => s + (r.cgstAmount || 0) + (r.sgstAmount || 0), 0);
  const grandTotal = sales.reduce((s, r) => s + (r.totalAmount || 0), 0);
  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Sales Ledger — FY {getFinancialYear()}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead><tr style={styles.thead}>{["Invoice No.", "Date", "Customer", "Taxable", "CGST", "SGST", "Total", "Status", "Action"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? "transparent" : "#ffffff05" }}>
                  <td style={{ ...styles.td, color: "#f97316", fontWeight: 700 }}>
                    {s.invoiceNo}
                    <button onClick={() => generateInvoicePDF(s)} style={{ marginLeft: 8, background: "#1e3a5f", color: "#60a5fa", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>🖨️ PDF</button>
                  </td>
                  <td style={styles.td}>{s.date}</td>
                  <td style={styles.td}>{s.customerName}</td>
                  <td style={{ ...styles.td, textAlign: "right" }}>{formatINR(s.taxableValue)}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: "#f97316" }}>{formatINR(s.cgstAmount)}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: "#f97316" }}>{formatINR(s.sgstAmount)}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: "#22c55e", fontWeight: 700 }}>{formatINR(s.totalAmount)}</td>
                  <td style={styles.td}><span style={{ color: s.status === "Paid" ? "#22c55e" : "#eab308", fontSize: 11 }}>{s.status}</span></td>
                  <td style={styles.td}><button onClick={() => deleteSale(s.id, s.invoiceNo)} style={{ background: "#450a0a", color: "#ef4444", border: "1px solid #ef444444", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#1a1d27", fontWeight: 700 }}>
                <td colSpan={3} style={{ ...styles.td, color: "#f1f5f9" }}>TOTAL</td>
                <td style={{ ...styles.td, textAlign: "right", color: "#3b82f6" }}>{formatINR(totalTaxable)}</td>
                <td style={{ ...styles.td, textAlign: "right", color: "#f97316" }}>{formatINR(totalTax / 2)}</td>
                <td style={{ ...styles.td, textAlign: "right", color: "#f97316" }}>{formatINR(totalTax / 2)}</td>
                <td style={{ ...styles.td, textAlign: "right", color: "#22c55e" }}>{formatINR(grandTotal)}</td>
                <td style={styles.td}></td><td style={styles.td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {sales.length === 0 && <div style={{ color: "#94a3b8", padding: 16 }}>No sales yet.</div>}
      </div>
    </div>
  );
}

function PurchasesList({ purchases, deletePurchase }) {
  const totalITC = purchases.reduce((s, r) => s + (r.itcAmount || 0), 0);
  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Purchase Ledger</div>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead><tr style={styles.thead}>{["Supplier Invoice", "Date", "Supplier", "Taxable", "CGST ITC", "SGST ITC", "Total ITC", "Action"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {purchases.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 === 0 ? "transparent" : "#ffffff05" }}>
                  <td style={{ ...styles.td, color: "#a855f7", fontWeight: 700 }}>{p.invoiceNo}</td>
                  <td style={styles.td}>{p.date}</td>
                  <td style={styles.td}>{p.supplierName}</td>
                  <td style={{ ...styles.td, textAlign: "right" }}>{formatINR(p.taxableValue)}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: "#a855f7" }}>{formatINR(p.cgstAmount)}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: "#a855f7" }}>{formatINR(p.cgstAmount)}</td>
                  <td style={{ ...styles.td, textAlign: "right", color: "#22c55e", fontWeight: 700 }}>{formatINR(p.itcAmount)}</td>
                  <td style={styles.td}><button onClick={() => deletePurchase(p.id, p.invoiceNo)} style={{ background: "#450a0a", color: "#ef4444", border: "1px solid #ef444444", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: "#1a1d27", fontWeight: 700 }}><td colSpan={6} style={{ ...styles.td }}>TOTAL ITC</td><td style={{ ...styles.td, textAlign: "right", color: "#22c55e" }}>{formatINR(totalITC)}</td><td style={styles.td}></td></tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function RefundTab({ totalSalesTaxable, totalOutputTax, totalITC, taxGap, refundAmount }) {
  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>GST Refund — Rule 89(5)</div>
        <div style={styles.grid2}>
          {[["Inverted Supply Turnover", formatINR(totalSalesTaxable), "#3b82f6"], ["Net ITC Available", formatINR(totalITC), "#a855f7"], ["Output Tax", formatINR(totalOutputTax), "#ef4444"], ["MAXIMUM REFUND", formatINR(refundAmount), "#22c55e"]].map(([label, value, color]) => (
            <div key={label} style={{ ...styles.posBox, borderColor: color }}><div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div><div style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PartyMaster({ parties }) {
  const [form, setForm] = useState({ partyName: "", gstin: "", address: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleSave = async () => {
    if (!form.partyName) return;
    setSaving(true);
    await addDoc(collection(db, "parties"), { partyName: form.partyName, gstin: form.gstin || "", address: form.address || "", phone: form.phone || "", email: form.email || "", createdAt: serverTimestamp() });
    setSaving(false); setSuccess(true);
    setForm({ partyName: "", gstin: "", address: "", phone: "", email: "" });
    setTimeout(() => setSuccess(false), 2000);
  };
  const filtered = parties.filter(p => p.partyName.toLowerCase().includes(search.toLowerCase()) || (p.gstin || "").toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>🏢 Add New Party</div>
        <div style={styles.grid2}>
          <Field label="Party Name *" value={form.partyName} onChange={v => set("partyName", v)} placeholder="ABC Packaging Co." />
          <Field label="GSTIN" value={form.gstin} onChange={v => set("gstin", v)} placeholder="06XXXXX1234X1ZX" />
          <Field label="Address" value={form.address} onChange={v => set("address", v)} placeholder="City, State" />
          <Field label="Phone" value={form.phone} onChange={v => set("phone", v)} placeholder="9XXXXXXXXX" />
        </div>
        <button onClick={handleSave} disabled={saving || success} style={styles.btnPrimary}>{success ? "✅ Saved!" : saving ? "Saving..." : "💾 Save Party"}</button>
      </div>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={styles.cardTitle}>All Parties ({parties.length})</div>
          <input style={{ ...styles.input, width: 200 }} placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtered.map(p => (
          <div key={p.id} style={styles.listRow}>
            <div><div style={{ color: "#f97316", fontWeight: 700 }}>{p.partyName}</div><div style={{ color: "#94a3b8", fontSize: 12 }}>{p.gstin && `GSTIN: ${p.gstin}`} {p.address}</div>{p.phone && <div style={{ color: "#64748b", fontSize: 12 }}>📱 {p.phone}</div>}</div>
            <div style={{ background: "#052e16", color: "#22c55e", padding: "4px 12px", borderRadius: 20, fontSize: 11 }}>Active</div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: "#94a3b8", padding: 16, textAlign: "center" }}>{parties.length === 0 ? "No parties yet." : "No results."}</div>}
      </div>
    </div>
  );
}

function LedgerTab({ sales, purchases }) {
  const [selected, setSelected] = useState("all");
  const [type, setType] = useState("customer");
  const customerLedger = {};
  sales.forEach(s => {
    const name = s.customerName || "Unknown";
    if (!customerLedger[name]) customerLedger[name] = { name, gstin: s.customerGstin || "", invoices: [], totalBilled: 0, totalReceived: 0 };
    customerLedger[name].invoices.push({ date: s.date, invoiceNo: s.invoiceNo, amount: s.totalAmount || 0, received: s.status === "Paid" ? s.totalAmount || 0 : 0, status: s.status || "Outstanding" });
    customerLedger[name].totalBilled += s.totalAmount || 0;
    if (s.status === "Paid") customerLedger[name].totalReceived += s.totalAmount || 0;
  });
  const supplierLedger = {};
  purchases.forEach(p => {
    const name = p.supplierName || "Unknown";
    if (!supplierLedger[name]) supplierLedger[name] = { name, gstin: p.supplierGstin || "", invoices: [], totalBilled: 0, totalPaid: 0 };
    supplierLedger[name].invoices.push({ date: p.date, invoiceNo: p.invoiceNo, amount: p.totalAmount || 0, status: "Outstanding" });
    supplierLedger[name].totalBilled += p.totalAmount || 0;
  });
  const ledger = type === "customer" ? customerLedger : supplierLedger;
  const parties_list = Object.values(ledger);
  const totalLena = Object.values(customerLedger).reduce((s, p) => s + p.totalBilled - p.totalReceived, 0);
  const totalDena = Object.values(supplierLedger).reduce((s, p) => s + p.totalBilled - (p.totalPaid || 0), 0);
  return (
    <div style={styles.section}>
      <div style={styles.grid2}>
        <div style={{ ...styles.statCard, borderLeftColor: "#22c55e" }}><div style={{ fontSize: 12, color: "#94a3b8" }}>LENA HAI</div><div style={{ fontSize: 24, fontWeight: 800, color: "#22c55e" }}>{formatINR(totalLena)}</div></div>
        <div style={{ ...styles.statCard, borderLeftColor: "#ef4444" }}><div style={{ fontSize: 12, color: "#94a3b8" }}>DENA HAI</div><div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444" }}>{formatINR(totalDena)}</div></div>
      </div>
      <div style={styles.card}>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button onClick={() => { setType("customer"); setSelected("all"); }} style={{ ...styles.btnPrimary, width: "auto", marginTop: 0, padding: "8px 20px", background: type === "customer" ? "#22c55e" : "#1a1d27", border: "1px solid #2a2d3a" }}>👥 Customer</button>
          <button onClick={() => { setType("supplier"); setSelected("all"); }} style={{ ...styles.btnPrimary, width: "auto", marginTop: 0, padding: "8px 20px", background: type === "supplier" ? "#ef4444" : "#1a1d27", border: "1px solid #2a2d3a" }}>🏭 Supplier</button>
        </div>
        {parties_list.map(party => {
          const outstanding = type === "customer" ? party.totalBilled - party.totalReceived : party.totalBilled - (party.totalPaid || 0);
          const isExpanded = selected === party.name;
          return (
            <div key={party.name} style={{ background: "#0f1117", borderRadius: 12, marginBottom: 10, border: `1px solid ${outstanding > 0 ? (type === "customer" ? "#22c55e44" : "#ef444444") : "#2a2d3a"}` }}>
              <div onClick={() => setSelected(isExpanded ? "all" : party.name)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ color: "#f97316", fontWeight: 700 }}>{party.name}</div><div style={{ color: "#94a3b8", fontSize: 12 }}>{party.invoices.length} invoice(s)</div></div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: outstanding > 0 ? (type === "customer" ? "#22c55e" : "#ef4444") : "#64748b", fontWeight: 800, fontSize: 16 }}>{formatINR(outstanding)}</div>
                  <button onClick={e => { e.stopPropagation(); generateStatementPDF(party, type, party.invoices); }} style={{ marginTop: 6, background: "#1e3a5f", color: "#60a5fa", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>🖨️ Statement</button>
                </div>
              </div>
              {isExpanded && (
                <div style={{ borderTop: "1px solid #2a2d3a", padding: 16 }}>
                  <table style={{ ...styles.table, fontSize: 12 }}>
                    <thead><tr style={styles.thead}><th style={styles.th}>Date</th><th style={styles.th}>Invoice</th><th style={{ ...styles.th, textAlign: "right" }}>Amount</th>{type === "customer" && <th style={{ ...styles.th, textAlign: "right" }}>Received</th>}<th style={{ ...styles.th, textAlign: "right" }}>Balance</th><th style={styles.th}>Status</th></tr></thead>
                    <tbody>
                      {party.invoices.map((inv, i) => {
                        const balance = type === "customer" ? inv.amount - (inv.received || 0) : inv.amount;
                        return (
                          <tr key={i} style={{ borderTop: "1px solid #2a2d3a" }}>
                            <td style={styles.td}>{inv.date}</td>
                            <td style={{ ...styles.td, color: "#f97316" }}>{inv.invoiceNo}</td>
                            <td style={{ ...styles.td, textAlign: "right" }}>{formatINR(inv.amount)}</td>
                            {type === "customer" && <td style={{ ...styles.td, textAlign: "right", color: "#22c55e" }}>{formatINR(inv.received || 0)}</td>}
                            <td style={{ ...styles.td, textAlign: "right", color: balance > 0 ? (type === "customer" ? "#22c55e" : "#ef4444") : "#64748b", fontWeight: 700 }}>{formatINR(balance)}</td>
                            <td style={styles.td}><span style={{ color: inv.status === "Paid" ? "#22c55e" : "#eab308", fontSize: 11 }}>{inv.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ ...styles.statCard, borderLeftColor: color }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span><span style={{ fontSize: 20 }}>{icon}</span></div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace", margin: "8px 0" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", readOnly = false }) {
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.label}>{label}</label>
      <input style={{ ...styles.input, opacity: readOnly ? 0.6 : 1 }} type={type} value={value} readOnly={readOnly} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)} />
    </div>
  );
}


// ============================================================
// PAYMENTS TAB — Due Date Tracker
// ============================================================
function PaymentsTab({ sales }) {
  const todayStr = today();
  const fmtDate = (d) => { if (!d) return "—"; const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

  const getDueStatus = (dueDate, status) => {
    if (status === "Paid") return { label: "Paid", color: "#22c55e", bg: "#052e16" };
    if (!dueDate) return { label: "No Terms", color: "#64748b", bg: "#1a1d27" };
    if (dueDate < todayStr) return { label: "Overdue", color: "#ef4444", bg: "#450a0a" };
    const diff = Math.ceil((new Date(dueDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
    if (diff <= 7) return { label: `Due in ${diff}d`, color: "#f97316", bg: "#431407" };
    if (diff <= 15) return { label: `Due in ${diff}d`, color: "#eab308", bg: "#422006" };
    return { label: `Due in ${diff}d`, color: "#22c55e", bg: "#052e16" };
  };

  const unpaid = sales.filter(s => s.status !== "Paid" && s.dueDate);
  const overdue = unpaid.filter(s => s.dueDate < todayStr);
  const dueSoon = unpaid.filter(s => s.dueDate >= todayStr && Math.ceil((new Date(s.dueDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 7);
  const totalOutstanding = unpaid.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalOverdue = overdue.reduce((s, r) => s + (r.totalAmount || 0), 0);

  return (
    <div style={styles.section}>
      {/* Summary Cards */}
      <div style={styles.grid4}>
        <div style={{ ...styles.statCard, borderLeftColor: "#ef4444" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Overdue</div><div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{overdue.length} bills</div><div style={{ fontSize: 12, color: "#ef4444" }}>{formatINR(totalOverdue)}</div></div>
        <div style={{ ...styles.statCard, borderLeftColor: "#f97316" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Due This Week</div><div style={{ fontSize: 22, fontWeight: 800, color: "#f97316" }}>{dueSoon.length} bills</div></div>
        <div style={{ ...styles.statCard, borderLeftColor: "#eab308" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Total Pending</div><div style={{ fontSize: 22, fontWeight: 800, color: "#eab308" }}>{unpaid.length} bills</div></div>
        <div style={{ ...styles.statCard, borderLeftColor: "#3b82f6" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Total Outstanding</div><div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6" }}>{formatINR(totalOutstanding)}</div></div>
      </div>

      {/* Bills List */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>💳 Payment Due Tracker</div>
        {unpaid.length === 0 && <div style={{ color: "#22c55e", textAlign: "center", padding: 20 }}>✅ Sab payments clear hain!</div>}
        {[...unpaid].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).map(sale => {
          const status = getDueStatus(sale.dueDate, sale.status);
          return (
            <div key={sale.id} style={{ background: status.bg, borderRadius: 10, padding: "12px 16px", marginBottom: 8, border: `1px solid ${status.color}33`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ color: "#f97316", fontWeight: 700 }}>{sale.invoiceNo}</div>
                <div style={{ color: "#f1f5f9", fontWeight: 600 }}>{sale.customerName}</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>Bill: {fmtDate(sale.date)} | Due: <span style={{ color: status.color, fontWeight: 700 }}>{fmtDate(sale.dueDate)}</span> | Terms: {sale.paymentTerms || "—"} days</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#22c55e", fontWeight: 800, fontSize: 16 }}>{formatINR(sale.totalAmount)}</div>
                <div style={{ background: status.color, color: "#fff", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginTop: 4 }}>{status.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ORDER PDF GENERATOR
// ============================================================
function generateOrderPDF(order) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210; const M = 10; const fw = W - M * 2;
  const fmtDate = (d) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

  // Header
  doc.setFillColor(26, 92, 56);
  doc.rect(M, 8, fw, 7, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("ORDER CONFIRMATION", M + 3, 13.5);
  doc.text("KUSHAAN PACKERS", M + fw - 2, 13.5, { align: "right" });

  // Firm details
  let y = 20;
  doc.setTextColor(26, 92, 56); doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("KUSHAAN PACKERS", M, y);
  doc.setTextColor(60, 60, 60); doc.setFontSize(7); doc.setFont("helvetica", "normal");
  y += 5; doc.text("GSTIN: 06ACQPL0313F1ZY | Mob: 98964-12626, 98965-56789", M, y);
  y += 4; doc.text("Near Tata Motors, Sanoli Road, Village Ugrakheri, Panipat-132103", M, y);
  y += 5;
  doc.setDrawColor(26, 92, 56); doc.setLineWidth(0.4);
  doc.line(M, y, M + fw, y); y += 4;

  // Order meta
  doc.setFillColor(245, 247, 255);
  doc.rect(M, y, fw / 2 - 2, 24, "F");
  doc.rect(M + fw / 2 + 2, y, fw / 2 - 2, 24, "F");
  doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("TO:", M + 2, y + 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(order.customerName || "", M + 2, y + 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  if (order.customerAddress) doc.text(order.customerAddress, M + 2, y + 15);
  if (order.customerGstin) doc.text(`GSTIN: ${order.customerGstin}`, M + 2, y + 19);

  const rx = M + fw / 2 + 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Order No:", rx, y + 5); doc.setFont("helvetica", "normal"); doc.text(order.orderNo || "", rx + 22, y + 5);
  doc.setFont("helvetica", "bold"); doc.text("Order Date:", rx, y + 10); doc.setFont("helvetica", "normal"); doc.text(fmtDate(order.orderDate), rx + 22, y + 10);
  doc.setFont("helvetica", "bold"); doc.text("Delivery By:", rx, y + 15);
  doc.setFont("helvetica", "bold"); doc.setTextColor(200, 50, 50);
  doc.text(fmtDate(order.deliveryDate), rx + 22, y + 15);
  doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "normal");
  y += 28;

  // Items table
  const tableRows = (order.items || []).map((item, idx) => {
    const size = item.productType !== "Corrugated Box"
      ? (item.length && item.breadth ? `${item.length}×${item.breadth}` : "")
      : (item.length && item.breadth ? `${item.length}×${item.breadth}${item.height ? "×" + item.height : ""}` : "");
    const rateDisplay = item.rateMode === "perSqInch"
      ? `₹${item.ratePerSqInch}/sq.in`
      : `₹${item.rate}/pc`;
    return [idx + 1, item.description || "", item.ply || "", size, `${item.quantity} ${item.unit}`, rateDisplay];
  });

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Ply", "Size (cm)", "Quantity", "Rate"]],
    body: tableRows,
    theme: "grid",
    headStyles: { fillColor: [26, 92, 56], textColor: 255, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      1: { cellWidth: 50 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 35, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 35, halign: "right" },
    },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Special instructions
  if (order.specialInstructions) {
    doc.setFillColor(255, 248, 230);
    doc.rect(M, y, fw, 12, "F");
    doc.setTextColor(150, 80, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("Special Instructions:", M + 2, y + 5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
    doc.text(order.specialInstructions, M + 2, y + 10);
    y += 16;
  }

  // Footer
  doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text("This is a confirmed order. Please deliver by the date mentioned above.", M, y + 5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("For KUSHAAN PACKERS", M + fw - 2, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text("Authorized Signatory _______________", M + fw - 2, y + 12, { align: "right" });

  const pdfOutput = doc.output("datauristring");
  const a = document.createElement("a");
  a.href = pdfOutput;
  a.download = `Order_${order.orderNo || "KP"}.pdf`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================
// ORDER BOOK — Main Component
// ============================================================
function OrderBook({ orders, nextOrderNo, FY, parties, addOrder, deleteOrder, convertOrderToSale, setTab }) {
  const [view, setView] = useState("list"); // "list" | "new"
  return (
    <div style={styles.section}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={() => setView("new")} style={{ ...styles.btnPrimary, width: "auto", marginTop: 0, padding: "10px 24px" }}>+ New Order</button>
        <button onClick={() => setView("list")} style={{ ...styles.btnPrimary, width: "auto", marginTop: 0, padding: "10px 24px", background: view === "list" ? "#1e3a5f" : "#0f1117", border: "1px solid #2a2d3a" }}>📋 Orders ({orders.length})</button>
      </div>
      {view === "new"
        ? <OrderForm nextOrderNo={nextOrderNo} FY={FY} parties={parties} onSubmit={async (data) => { await addOrder(data); setView("list"); }} onCancel={() => setView("list")} />
        : <OrdersList orders={orders} deleteOrder={deleteOrder} convertOrderToSale={convertOrderToSale} />
      }
    </div>
  );
}

// ============================================================
// ORDER FORM
// ============================================================
function OrderForm({ nextOrderNo, FY, parties, onSubmit, onCancel }) {
  const [header, setHeader] = useState({ orderDate: today(), deliveryDate: "", customerName: "", customerGstin: "", customerAddress: "", selectedPartyId: "", specialInstructions: "" });
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [saving, setSaving] = useState(false);
  const setH = (k, v) => setHeader(p => ({ ...p, [k]: v }));
  const orderNo = `KP-ORD-${FY}-${String(nextOrderNo).padStart(3, "0")}`;

  const handlePartySelect = (partyId) => {
    if (!partyId || partyId === "__new__") { setHeader(p => ({ ...p, selectedPartyId: "", customerName: "", customerGstin: "", customerAddress: "" })); return; }
    const party = parties.find(p => p.id === partyId);
    if (party) setHeader(p => ({ ...p, selectedPartyId: partyId, customerName: party.partyName || "", customerGstin: party.gstin || "", customerAddress: party.address || "" }));
  };

  const setItem = (id, k, v) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [k]: v };
      if (k === "productType" || k === "ply") {
        const pt = k === "productType" ? v : item.productType;
        const pl = k === "ply" ? v : item.ply;
        updated.description = `${pt} ${pl}`;
        if (pt !== "Corrugated Box") updated.height = "";
      }
      // Recalculate taxable
      let boxTaxable = 0;
      if (updated.rateMode === "perSqInch") {
        const calc = calcBoxRate(updated);
        boxTaxable = parseFloat(calc.taxable) || 0;
      } else {
        const qty = parseFloat(updated.quantity) || 0;
        const rate = parseFloat(updated.rate) || 0;
        boxTaxable = parseFloat((qty * rate).toFixed(2));
      }
      const printTax = calcPrintingTaxable(updated);
      updated.printingTaxable = printTax.toFixed(2);
      updated.taxable = (boxTaxable + printTax).toFixed(2);
      return updated;
    }));
  };

  const toggleRateMode = (id, mode) => {
    setItems(prev => prev.map(item => item.id !== id ? item : { ...item, rateMode: mode, taxable: "0.00" }));
  };

  const handleSubmit = async () => {
    if (!header.customerName || !header.deliveryDate) return alert("Party aur Delivery Date zaroori hai!");
    setSaving(true);
    await onSubmit({ ...header, items });
    setSaving(false);
  };

  const isSqInch = (item) => item.rateMode === "perSqInch";

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>New Order — <span style={{ color: "#f97316" }}>{orderNo}</span></div>
      {parties.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={styles.label}>Party Select 🏢</label>
          <select style={{ ...styles.input, marginTop: 6 }} value={header.selectedPartyId} onChange={e => handlePartySelect(e.target.value)}>
            <option value="">-- Party select karo --</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.partyName} {p.gstin ? "| " + p.gstin : ""}</option>)}
          </select>
        </div>
      )}
      <div style={styles.grid2}>
        <Field label="Order Date" type="date" value={header.orderDate} onChange={v => setH("orderDate", v)} />
        <Field label="Delivery Date *" type="date" value={header.deliveryDate} onChange={v => setH("deliveryDate", v)} />
        <Field label="Customer Name *" value={header.customerName} onChange={v => setH("customerName", v)} placeholder="Party ka naam" />
        <Field label="Customer GSTIN" value={header.customerGstin} onChange={v => setH("customerGstin", v)} placeholder="Optional" />
        <Field label="Customer Address" value={header.customerAddress || ""} onChange={v => setH("customerAddress", v)} placeholder="City, State" />
        <Field label="Special Instructions" value={header.specialInstructions} onChange={v => setH("specialInstructions", v)} placeholder="Koi khaas baat..." />
      </div>

      {/* Items — Same as SaleForm */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: "#f1f5f9", fontWeight: 700 }}>📦 Items</div>
          <button onClick={() => setItems(p => [...p, EMPTY_ITEM()])} style={styles.btnAdd}>+ Add Item</button>
        </div>
        {items.map((item, idx) => {
          const sqCalc = isSqInch(item) ? calcBoxRate(item) : null;
          return (
          <div key={item.id} style={styles.itemCard}>
            {/* Row 1: Product + Ply + Description + HSN */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ color: "#f97316", fontWeight: 800, fontSize: 14, minWidth: 24 }}>{idx + 1}</div>
              <select style={{ ...styles.itemInput, width: 150 }} value={item.productType} onChange={e => setItem(item.id, "productType", e.target.value)}>
                <option>Corrugated Box</option><option>Stiffener</option><option>Sheet</option>
              </select>
              <select style={{ ...styles.itemInput, width: 90 }} value={item.ply} onChange={e => setItem(item.id, "ply", e.target.value)}>
                <option>3 Ply</option><option>5 Ply</option><option>7 Ply</option>
              </select>
              <input style={{ ...styles.itemInput, flex: 1, minWidth: 120 }} value={item.description} onChange={e => setItem(item.id, "description", e.target.value)} placeholder="Description (auto)" />
              {items.length > 1 && <button onClick={() => setItems(p => p.filter(i => i.id !== item.id))} style={styles.btnRemove}>✕</button>}
            </div>
            {/* Row 2: L×B×H + Qty + Unit */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>{item.productType === "Corrugated Box" ? "L×B×H (cm):" : "L×B (cm):"}</span>
                <input style={{ ...styles.itemInput, width: 52, textAlign: "center" }} type="number" value={item.length} onChange={e => setItem(item.id, "length", e.target.value)} placeholder="L" />
                <span style={{ color: "#475569" }}>×</span>
                <input style={{ ...styles.itemInput, width: 52, textAlign: "center" }} type="number" value={item.breadth} onChange={e => setItem(item.id, "breadth", e.target.value)} placeholder="B" />
                {item.productType === "Corrugated Box" && (<><span style={{ color: "#475569" }}>×</span><input style={{ ...styles.itemInput, width: 52, textAlign: "center" }} type="number" value={item.height} onChange={e => setItem(item.id, "height", e.target.value)} placeholder="H" /></>)}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>Qty:</span>
                <input style={{ ...styles.itemInput, width: 72 }} type="number" value={item.quantity} onChange={e => setItem(item.id, "quantity", e.target.value)} placeholder="100" />
                <select style={{ ...styles.itemInput, width: 68 }} value={item.unit} onChange={e => setItem(item.id, "unit", e.target.value)}>{["PCS", "KG", "MTR", "LTR", "BOX"].map(u => <option key={u}>{u}</option>)}</select>
              </div>
            </div>
            {/* Row 3: Rate Mode + Rate + Taxable */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>Rate Mode:</span>
                <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                  <button onClick={() => toggleRateMode(item.id, "perPiece")} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: !isSqInch(item) ? "#f97316" : "#0f1117", color: !isSqInch(item) ? "#fff" : "#64748b" }}>₹/Piece</button>
                  <button onClick={() => toggleRateMode(item.id, "perSqInch")} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: isSqInch(item) ? "#3b82f6" : "#0f1117", color: isSqInch(item) ? "#fff" : "#64748b" }}>₹/Sq.In</button>
                </div>
              </div>
              {!isSqInch(item) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#64748b", fontSize: 11 }}>Rate (₹/piece):</span>
                  <input style={{ ...styles.itemInput, width: 120, border: "1px solid #f97316" }} type="number" value={item.rate} onChange={e => setItem(item.id, "rate", e.target.value)} placeholder="200" />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#64748b", fontSize: 11 }}>Rate (₹/sq.inch):</span>
                  <input style={{ ...styles.itemInput, width: 120, border: "1px solid #3b82f6" }} type="number" value={item.ratePerSqInch} onChange={e => setItem(item.id, "ratePerSqInch", e.target.value)} placeholder="0.045" step="0.001" />
                  {sqCalc && sqCalc.valid && (
                    <div style={{ background: "#0a1f3a", border: "1px solid #3b82f644", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
                      <span style={{ color: "#64748b" }}>= </span>
                      <span style={{ color: "#60a5fa", fontWeight: 700 }}>₹{sqCalc.ratePerBox.toFixed(2)}/box</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>Taxable (₹):</span>
                <input style={{ ...styles.itemInput, width: 120, color: "#22c55e", fontWeight: 700 }} type="number" value={item.taxable} readOnly placeholder="0.00" />
              </div>
            </div>
            {/* Row 4: Printing */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #2a2d3a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: item.printing ? 8 : 0 }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>🖨️ Printing:</span>
                <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                  <button onClick={() => setItem(item.id, "printing", false)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: !item.printing ? "#475569" : "#0f1117", color: !item.printing ? "#fff" : "#64748b" }}>No</button>
                  <button onClick={() => setItem(item.id, "printing", true)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: item.printing ? "#a855f7" : "#0f1117", color: item.printing ? "#fff" : "#64748b" }}>Yes</button>
                </div>
                {item.printing && <span style={{ color: "#a855f7", fontSize: 11 }}>Printing: ₹{item.printingTaxable || "0"}</span>}
              </div>
              {item.printing && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Colors:</span>
                    <select style={{ ...styles.itemInput, width: 100 }} value={item.printingColors} onChange={e => setItem(item.id, "printingColors", e.target.value)}>
                      <option>1 Color</option><option>2 Color</option><option>3 Color</option><option>4 Color</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Sides:</span>
                    <select style={{ ...styles.itemInput, width: 90 }} value={item.printingSides} onChange={e => setItem(item.id, "printingSides", e.target.value)}>
                      <option>1 Side</option><option>2 Side</option><option>3 Side</option><option>4 Side</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Rate Type:</span>
                    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2d3a" }}>
                      <button onClick={() => setItem(item.id, "printingRateType", "perSide")} style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: item.printingRateType === "perSide" ? "#a855f7" : "#0f1117", color: item.printingRateType === "perSide" ? "#fff" : "#64748b" }}>Per Side</button>
                      <button onClick={() => setItem(item.id, "printingRateType", "perBox")} style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: item.printingRateType === "perBox" ? "#a855f7" : "#0f1117", color: item.printingRateType === "perBox" ? "#fff" : "#64748b" }}>Per Box</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Printing Rate (₹):</span>
                    <input style={{ ...styles.itemInput, width: 110, border: "1px solid #a855f7" }} type="number" value={item.printingRate} onChange={e => setItem(item.id, "printingRate", e.target.value)} placeholder="0.50" step="0.25" />
                  </div>
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button onClick={handleSubmit} disabled={saving} style={{ ...styles.btnPrimary, marginTop: 0, background: "#22c55e" }}>{saving ? "Saving..." : "💾 Save Order"}</button>
        <button onClick={onCancel} style={{ ...styles.btnPrimary, marginTop: 0, background: "#475569", width: "auto", padding: "12px 24px" }}>Cancel</button>
      </div>
    </div>
  );
}

// ============================================================
// ORDERS LIST
// ============================================================
function OrdersList({ orders, deleteOrder, convertOrderToSale }) {
  const todayStr = today();
  const getDeliveryColor = (deliveryDate) => {
    if (!deliveryDate) return "#64748b";
    if (deliveryDate < todayStr) return "#ef4444";
    const diff = (new Date(deliveryDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24);
    if (diff <= 2) return "#f97316";
    if (diff <= 5) return "#eab308";
    return "#22c55e";
  };
  const fmtDate = (d) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };
  const pending = orders.filter(o => o.status !== "Billed");
  const billed = orders.filter(o => o.status === "Billed");

  return (
    <div style={styles.section}>
      {/* Summary */}
      <div style={styles.grid2}>
        <div style={{ ...styles.statCard, borderLeftColor: "#f97316" }}><div style={{ fontSize: 12, color: "#94a3b8" }}>Pending Orders</div><div style={{ fontSize: 28, fontWeight: 800, color: "#f97316" }}>{pending.length}</div></div>
        <div style={{ ...styles.statCard, borderLeftColor: "#22c55e" }}><div style={{ fontSize: 12, color: "#94a3b8" }}>Billed Orders</div><div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{billed.length}</div></div>
      </div>

      {/* Pending Orders */}
      {pending.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>⏳ Pending Orders</div>
          {pending.map(order => (
            <div key={order.id} style={{ background: "#0f1117", borderRadius: 12, marginBottom: 10, border: "1px solid #2a2d3a", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ color: "#f97316", fontWeight: 800, fontSize: 15 }}>{order.orderNo}</div>
                  <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, marginTop: 2 }}>{order.customerName}</div>
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Order: {fmtDate(order.orderDate)}</div>
                  {order.specialInstructions && <div style={{ color: "#eab308", fontSize: 11, marginTop: 4 }}>📝 {order.specialInstructions}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Delivery by:</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: getDeliveryColor(order.deliveryDate) }}>{fmtDate(order.deliveryDate)}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => generateOrderPDF(order)} style={{ background: "#1e3a5f", color: "#60a5fa", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>🖨️ Print</button>
                    <button onClick={() => convertOrderToSale(order)} style={{ background: "#052e16", color: "#22c55e", border: "1px solid #22c55e44", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>📦 Bill Banao</button>
                    <button onClick={() => deleteOrder(order.id, order.orderNo)} style={{ background: "#450a0a", color: "#ef4444", border: "1px solid #ef444444", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>🗑️</button>
                  </div>
                </div>
              </div>
              {/* Items preview */}
              <div style={{ borderTop: "1px solid #1a1d27", padding: "10px 16px", background: "#0a0d14" }}>
                {(order.items || []).map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                    <span style={{ color: "#94a3b8" }}>{item.description} {item.length && item.breadth ? `(${item.length}×${item.breadth}${item.height ? "×" + item.height : ""})` : ""}</span>
                    <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{item.quantity} {item.unit} @ {item.rateMode === "perSqInch" ? `₹${item.ratePerSqInch}/sq.in` : `₹${item.rate}/pc`}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Billed Orders */}
      {billed.length > 0 && (
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, color: "#22c55e" }}>✅ Billed Orders</div>
          {billed.map(order => (
            <div key={order.id} style={styles.listRow}>
              <div>
                <div style={{ color: "#22c55e", fontWeight: 700 }}>{order.orderNo}</div>
                <div style={{ color: "#94a3b8", fontSize: 12 }}>{order.customerName} | {fmtDate(order.orderDate)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => generateOrderPDF(order)} style={{ background: "#1e3a5f", color: "#60a5fa", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>🖨️</button>
                <button onClick={() => deleteOrder(order.id, order.orderNo)} style={{ background: "#450a0a", color: "#ef4444", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {orders.length === 0 && <div style={{ ...styles.card, textAlign: "center", color: "#94a3b8" }}>Koi order nahi hai abhi.</div>}
    </div>
  );
}

const styles = {
  app: { minHeight: "100vh", background: "#0f1117", color: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  loadingScreen: { minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center" },
  loadingBox: { textAlign: "center" },
  header: { background: "#1a1d27", borderBottom: "1px solid #2a2d3a", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, position: "sticky", top: 0, zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { width: 40, height: 40, background: "linear-gradient(135deg, #f97316, #fb923c)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  firmName: { fontSize: 16, fontWeight: 800 },
  firmSub: { fontSize: 11, color: "#94a3b8" },
  headerRight: { display: "flex", gap: 6, flexWrap: "wrap" },
  badgePurple: { background: "#2e1065", color: "#a855f7", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  badgeBlue: { background: "#0c1a3a", color: "#3b82f6", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  badgeGreen: { background: "#052e16", color: "#22c55e", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  tabBar: { background: "#1a1d27", padding: "0 16px", display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid #2a2d3a" },
  tab: { background: "transparent", color: "#94a3b8", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, borderBottom: "2px solid transparent", whiteSpace: "nowrap" },
  tabActive: { background: "transparent", color: "#f97316", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, borderBottom: "2px solid #f97316", whiteSpace: "nowrap" },
  content: { maxWidth: 1200, margin: "0 auto", padding: 20 },
  section: { display: "flex", flexDirection: "column", gap: 20 },
  card: { background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 16, padding: 24 },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#f1f5f9" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  statCard: { background: "#1a1d27", border: "1px solid #2a2d3a", borderLeft: "4px solid", borderRadius: 16, padding: "16px 20px" },
  alertGreen: { background: "linear-gradient(135deg, #052e16, #0a3d1f)", border: "1px solid #22c55e44", borderRadius: 12, padding: "14px 20px", color: "#86efac", fontSize: 14 },
  posBox: { background: "#0f1117", borderRadius: 12, padding: 16, border: "1px solid", display: "flex", flexDirection: "column", gap: 8 },
  formulaBox: { background: "#0f1117", borderRadius: 10, padding: 16, border: "1px dashed #f97316", marginTop: 16 },
  listRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #2a2d3a" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  thead: { background: "#0f1117" },
  th: { padding: "10px 12px", textAlign: "left", color: "#94a3b8", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderTop: "1px solid #2a2d3a", color: "#f1f5f9", whiteSpace: "nowrap" },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, color: "#94a3b8", fontWeight: 500 },
  input: { background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  taxPreview: { background: "#0f1117", borderRadius: 10, padding: 16, border: "1px solid #22c55e33", marginTop: 16 },
  btnPrimary: { background: "#f97316", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, cursor: "pointer", fontSize: 15, marginTop: 20, width: "100%" },
  btnAdd: { background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  btnRemove: { background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 13 },
  itemCard: { background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 10, padding: 14, marginBottom: 10 },
  itemInput: { background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 6, padding: "7px 10px", color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" },
};
