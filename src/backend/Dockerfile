FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt /app/
RUN pip install -r requirements.txt

COPY src/backend /app

EXPOSE 8081

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8081"]
