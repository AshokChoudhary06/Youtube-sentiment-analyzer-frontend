document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const statusText = document.getElementById('status');
    const resultsDiv = document.getElementById('results');

    analyzeBtn.addEventListener('click', async () => {
        // 1. Update UI to show activity
        statusText.innerText = "Sending test data to FastAPI...";
        analyzeBtn.disabled = true;
        resultsDiv.style.display = "none";

        // 2. Hardcoded test data (Bypassing YouTube for now)
        const dummyComments = [
            "This is the best tutorial I have ever watched! Thank you!",
            "Terrible audio quality, completely useless.",
            "It was okay, but a bit too long.",
            "Loved the explanation, very clear.",
            "I hate how slow this video is."
        ];

        try {
            // 3. Send the dummy data to your backend
            const apiResponse = await fetch("http://127.0.0.1:8000/predict", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                // Matches your Pydantic schema: data.comment
                body: JSON.stringify({ comment: dummyComments }) 
            });

            // Catch HTTP errors (like 422 Unprocessable Entity or 500 Internal Server Error)
            if (!apiResponse.ok) {
                const errorDetail = await apiResponse.text();
                throw new Error(`Server returned ${apiResponse.status}: ${errorDetail}`);
            }

            const data = await apiResponse.json();

            // 4. Tally up the sentiment results
            let pos = 0, neu = 0, neg = 0;

            // Loop through the [{"comment": "...", "sentiment": "1"}, ...] array
            data.forEach(item => {
                // Checking string and integer formats for safety
                if (item.sentiment === "1" || item.sentiment === 1 || item.sentiment === "Positive") pos++;
                else if (item.sentiment === "-1" || item.sentiment === -1 || item.sentiment === "Negative") neg++;
                else neu++;
            });

            // 5. Update the HTML dashboard
            document.getElementById('posCount').innerText = pos;
            document.getElementById('neuCount').innerText = neu;
            document.getElementById('negCount').innerText = neg;
            document.getElementById('totalCount').innerText = data.length;

            statusText.innerText = "✅ Test Analysis Complete!";
            resultsDiv.style.display = "block";

        } catch (error) {
            statusText.innerText = "❌ API Error: Is Uvicorn running?";
            console.error("Fetch Error Details:", error);
        } finally {
            // Re-enable the button
            analyzeBtn.disabled = false;
        }
    });
});