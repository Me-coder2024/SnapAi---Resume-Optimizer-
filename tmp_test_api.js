async function testJSearch() {
  const url = 'https://jsearch.p.rapidapi.com/search?query=web%20development%20internship&page=1&num_pages=1';
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': '53442d9ba3mshc88097fe05e747bp181768jsnbe660e075cdc',
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    }
  };

  try {
    const res = await fetch(url, options);
    console.log("JSearch Response Status:", res.status);
    if (!res.ok) {
      const text = await res.text();
      console.log("JSearch Error Body:", text.substring(0, 500));
    } else {
      console.log("JSearch OK");
      const data = await res.json();
      console.log("Jobs found:", data.data ? data.data.length : 0);
    }
  } catch (err) {
    console.error("JSearch Req Error:", err.message);
  }
}

testJSearch().then(() => console.log("Done"));
