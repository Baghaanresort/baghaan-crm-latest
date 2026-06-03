export function numberToIndianWords(num: number): string {
  if (num === 0) return 'Zero';
  num = Math.round(Number(num));
  if (isNaN(num) || num < 0) return '';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigit(n: number): string {
    if (n < 20) return ones[n] ?? '';
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + (ones[n % 10] ?? '') : '');
  }

  function threeDigit(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    let o = '';
    if (h) o += (ones[h] ?? '') + ' Hundred';
    if (r) o += (h ? ' and ' : '') + twoDigit(r);
    return o;
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;

  let out = '';
  if (crore) out += twoDigit(crore) + ' Crore ';
  if (lakh) out += twoDigit(lakh) + ' Lakh ';
  if (thousand) out += twoDigit(thousand) + ' Thousand ';
  if (rest) out += threeDigit(rest);

  return out.trim() + ' only';
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
