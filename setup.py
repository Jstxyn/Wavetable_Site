"""
Setup script for the Wavetable AI project
"""

from setuptools import setup, find_packages

setup(
    name="wavetable_ai",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "flask",
        "flask-cors",
        "numpy",
        "scipy",
        "opencv-python",
    ],
    python_requires=">=3.8",
)
