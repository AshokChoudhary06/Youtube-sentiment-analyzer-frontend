document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const statusText = document.getElementById('status');
    const resultsDiv = document.getElementById('results');

    // 🔑 PASTE YOUR YOUTUBE DATA API KEY HERE
    const YOUTUBE_API_KEY = "Api_Key";
    let globalCsvContent = ""; //

    analyzeBtn.addEventListener('click', async () => {
        statusText.innerText = "Extracting Video ID...";
        analyzeBtn.disabled = true;
        resultsDiv.style.display = "none";
        
        // Hide visuals from previous runs
        document.getElementById('wordCloudImg').style.display = "none";
        document.getElementById('heatmapImg').style.display = "none";

        try {
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url.includes("youtube.com/watch")) {
                statusText.innerText = "❌ Please open a YouTube video first!";
                analyzeBtn.disabled = false;
                return;
            }

            const urlParams = new URLSearchParams(new URL(tab.url).search);
            const videoId = urlParams.get("v");

            if (!videoId) {
                statusText.innerText = "❌ Could not find a Video ID in the URL.";
                analyzeBtn.disabled = false;
                return;
            }

            statusText.innerText = `Fetching all comments (this may take a moment)...`;

            let allCommentsData = [];
            let nextPageToken = "";
            
            while (nextPageToken !== null) {
                let ytApiUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}&maxResults=100`;
                if (nextPageToken !== "") {
                    ytApiUrl += `&pageToken=${nextPageToken}`;
                }

                const ytResponse = await fetch(ytApiUrl);
                
                if (!ytResponse.ok) throw new Error("YouTube API failed. Check your API Key.");

                const ytData = await ytResponse.json();
                
                if (ytData.items) {
                    // --- NEW: Extract text AND date ---
                    const batchData = ytData.items.map(item => ({
                        text: item.snippet.topLevelComment.snippet.textOriginal,
                        date: item.snippet.topLevelComment.snippet.publishedAt
                    }));
                    allCommentsData = allCommentsData.concat(batchData);
                    statusText.innerText = `Fetched ${allCommentsData.length} comments so far...`;
                }

                nextPageToken = ytData.nextPageToken || null;
            }

            if (allCommentsData.length === 0) {
                statusText.innerText = "⚠️ No comments found on this video.";
                analyzeBtn.disabled = false;
                return;
            }

            statusText.innerText = `Running ML Sentiment Analysis...`;

            // Separate the data to match your existing backend schemas
            // /predict and /generate_wordcloud only need the text array
            const textOnlyArray = allCommentsData.map(c => c.text);

            // --- SEND 3 PARALLEL REQUESTS TO FASTAPI ---
            const [predictRes, cloudRes, heatmapRes] = await Promise.all([
                fetch("http://127.0.0.1:8000/predict", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ comment: textOnlyArray })
                }),
                fetch("http://127.0.0.1:8000/generate_wordcloud", {
                    method: "POST",
                    headers: { 
                        "Accept": "image/png, application/json",
                        "Content-Type": "application/json" 
                    },
                    body: JSON.stringify({ comment: textOnlyArray })
                }),
                fetch("http://127.0.0.1:8000/generate_heatmap", {
                    method: "POST",
                    headers: {
                        "Accept": "image/png, application/json",
                        "Content-Type": "application/json"
                    },
                    // Heatmap needs the new schema with both text and dates
                    body: JSON.stringify({ comment: allCommentsData })
                })
            ]);

            // --- 1. PROCESS PREDICTIONS (NUMBERS & BAR) ---
            // --- 1. PROCESS PREDICTIONS (NUMBERS & BAR) ---
            if (!predictRes.ok) throw new Error("Sentiment analysis failed.");
            
            // The response is now a dictionary containing predictions and kpis
            const predictData = await predictRes.json();
            
            // Extract the two pieces
            const predictions = predictData.predictions;
            const kpis = predictData.kpis;

            // --- NEW: Map the KPIs to the HTML ---
            document.getElementById('kpiTotal').innerText = kpis.total;
            document.getElementById('kpiLength').innerText = kpis.avg_words;
            
            // Add formatting so it looks like "3.5x" and "12%"
            document.getElementById('kpiRatio').innerText = kpis.ratio + "x";

            // --- NEW: FORMAT DATA FOR CSV EXPORT ---
            globalCsvContent = "--- DASHBOARD SUMMARY ---\n";
            globalCsvContent += `Total Comments Analyzed,${kpis.total}\n`;
            globalCsvContent += `Average Words per Comment,${kpis.avg_words}\n`;
            globalCsvContent += `Positive to Negative Ratio,${kpis.ratio}x\n`;
            
            globalCsvContent += "--- RAW PREDICTIONS ---\n";
            globalCsvContent += "Comment,Sentiment\n";

            predictions.forEach(item => {
                // We must escape quotation marks and wrap the comment in quotes 
                // so commas inside the comment don't break the CSV columns!
                let safeText = item.comment.replace(/"/g, '""'); 
                globalCsvContent += `"${safeText}",${item.sentiment}\n`;
            });

            let pos = 0, neu = 0, neg = 0;
            const total = predictions.length;

            predictions.forEach(item => {
                const sentiment = item.sentiment.toLowerCase();
                if (sentiment === "positive") pos++;
                else if (sentiment === "negative") neg++;
                else neu++;
            });

            const posPerc = total > 0 ? Math.round((pos / total) * 100) : 0;
            const negPerc = total > 0 ? Math.round((neg / total) * 100) : 0;
            const neuPerc = total > 0 ? (100 - posPerc - negPerc) : 0;

            document.getElementById('posCount').innerText = pos;
            document.getElementById('neuCount').innerText = neu;
            document.getElementById('negCount').innerText = neg;

            document.getElementById('barPos').style.width = posPerc + "%";
            document.getElementById('barNeu').style.width = neuPerc + "%";
            document.getElementById('barNeg').style.width = negPerc + "%";

            document.getElementById('percPos').innerText = posPerc + "%";
            document.getElementById('percNeu').innerText = neuPerc + "%";
            document.getElementById('percNeg').innerText = negPerc + "%";

            // --- 2. PROCESS WORD CLOUD (STREAMING) ---
            if (cloudRes.ok) {
                const contentType = cloudRes.headers.get("content-type");
                if (contentType && contentType.includes("image/png")) {
                    const blob = await cloudRes.blob();
                    const imgUrl = URL.createObjectURL(blob);
                    const imgElement = document.getElementById('wordCloudImg');
                    imgElement.src = imgUrl;
                    imgElement.style.display = "block";
                } else {
                    const errorData = await cloudRes.json();
                    console.warn("Word cloud error:", errorData);
                }
            }

            // --- 3. PROCESS HEATMAP (STREAMING) ---
            if (heatmapRes.ok) {
                const contentType = heatmapRes.headers.get("content-type");
                if (contentType && contentType.includes("image/png")) {
                    const blob = await heatmapRes.blob();
                    const imgUrl = URL.createObjectURL(blob);
                    const heatmapElement = document.getElementById('heatmapImg');
                    heatmapElement.src = imgUrl;
                    heatmapElement.style.display = "block";
                } else {
                    const errorData = await heatmapRes.json();
                    console.warn("Heatmap error:", errorData);
                }
            }

            statusText.innerText = "✅ Analysis Complete!";
            resultsDiv.style.display = "block"; 

        } catch (error) {
            statusText.innerText = `❌ Error: ${error.message}`;
            console.error(error);
        } finally {
            analyzeBtn.disabled = false;
        }
    });
    document.getElementById('exportBtn').addEventListener('click', () => {
        if (!globalCsvContent) return;
        
        // Convert the text string into a downloadable Blob
        const blob = new Blob([globalCsvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        // Create a fake hidden link, click it to download, and destroy it
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "yt_sentiment_analysis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});