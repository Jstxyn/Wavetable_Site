from flask import Flask, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return jsonify({
        "status": "ok",
        "message": "Wavetable API is running"
    })

@app.route("/health")
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "Wavetable API is running"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    app.run(host="0.0.0.0", port=port)
