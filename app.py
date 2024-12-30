from flask import Flask, render_template

app = Flask(__name__)

# Disable debug mode in production
app.config['DEBUG'] = False

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    # Only use this for local development
    app.run(host='0.0.0.0', port=5000) 