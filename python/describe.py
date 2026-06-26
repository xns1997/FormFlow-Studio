#!/usr/bin/env python3
"""数据分析描述脚本 - Kaggle 风格 + 数据科学增强"""
import json
import sys

def describe(file_path, sheet_name=None):
    import pandas as pd
    import numpy as np

    ext = file_path.split('.')[-1].lower()
    if ext in ('xlsx', 'xls'):
        df = pd.read_excel(file_path, sheet_name=sheet_name or 0)
    elif ext == 'csv':
        df = pd.read_csv(file_path)
    else:
        return {"error": f"不支持的文件格式: {ext}"}

    # 基本概览
    report = {
        "fileName": file_path.split('/')[-1],
        "sheetName": sheet_name,
        "overview": {
            "rows": df.shape[0],
            "columns": df.shape[1],
            "memoryUsage": f"{df.memory_usage(deep=True).sum() / 1024:.1f} KB",
            "missingTotal": int(df.isnull().sum().sum()),
            "missingPercent": f"{df.isnull().mean().mean() * 100:.1f}%",
            "duplicateRows": int(df.duplicated().sum()),
            "duplicatePercent": f"{df.duplicated().mean() * 100:.1f}%",
        },
        "columns": [],
        "correlations": {"numericColumns": [], "matrix": []},
        "distributions": [],
        "qualityScore": 0,
    }

    numeric_cols = []
    for col in df.columns:
        col_info = {
            "name": str(col),
            "dtype": str(df[col].dtype),
            "nonNull": int(df[col].count()),
            "nullCount": int(df[col].isnull().sum()),
            "nullPercent": f"{df[col].isnull().mean() * 100:.1f}%",
            "uniqueCount": int(df[col].nunique()),
            "sampleValues": [str(v) for v in df[col].dropna().unique()[:5]],
        }

        if df[col].dtype in ('int64', 'float64', 'int32', 'float32'):
            desc = df[col].describe()
            skewness = float(df[col].skew()) if df[col].count() > 2 else 0
            kurtosis = float(df[col].kurtosis()) if df[col].count() > 3 else 0
            q1 = float(desc.get('25%', 0))
            q3 = float(desc.get('75%', 0))
            iqr = q3 - q1
            outlier_count = int(((df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)).sum())

            col_info["stats"] = {
                "mean": round(float(desc.get('mean', 0)), 4),
                "std": round(float(desc.get('std', 0)), 4),
                "min": round(float(desc.get('min', 0)), 4),
                "q25": round(q1, 4),
                "median": round(float(desc.get('50%', 0)), 4),
                "q75": round(q3, 4),
                "max": round(float(desc.get('max', 0)), 4),
            }
            col_info["type"] = "number"
            col_info["hasOutliers"] = outlier_count > 0
            col_info["outlierCount"] = outlier_count
            col_info["cardinality"] = "high" if df[col].nunique() > 20 else "medium" if df[col].nunique() > 5 else "low"
            numeric_cols.append(col)
        elif df[col].nunique() < 20 and df[col].dtype == 'object':
            col_info["topValues"] = {str(k): int(v) for k, v in df[col].value_counts().head(10).items()}
            col_info["type"] = "category"
            col_info["cardinality"] = "low" if df[col].nunique() <= 5 else "medium" if df[col].nunique() <= 20 else "high"
        elif 'datetime' in str(df[col].dtype):
            col_info["type"] = "date"
            col_info["min"] = str(df[col].min())
            col_info["max"] = str(df[col].max())
            col_info["cardinality"] = "high"
        elif df[col].dtype == 'bool':
            col_info["type"] = "boolean"
            col_info["cardinality"] = "low"
        else:
            col_info["type"] = "string"
            col_info["cardinality"] = "high" if df[col].nunique() > 20 else "medium" if df[col].nunique() > 5 else "low"

        col_info["sampleValues"] = [str(v) for v in df[col].dropna().unique()[:5]]
        report["columns"].append(col_info)

    # 相关性矩阵
    if len(numeric_cols) >= 2:
        corr_matrix = df[numeric_cols].corr().round(4).values.tolist()
        report["correlations"] = {
            "numericColumns": [str(c) for c in numeric_cols],
            "matrix": corr_matrix,
        }

    # 分布信息
    for col in numeric_cols[:10]:
        try:
            col_data = df[col].dropna()
            if len(col_data) > 0:
                hist, bin_edges = np.histogram(col_data, bins=10)
                bins = []
                for i in range(len(hist)):
                    bins.append({
                        "range": f"{bin_edges[i]:.2f}-{bin_edges[i+1]:.2f}",
                        "count": int(hist[i]),
                        "percent": round(hist[i] / len(col_data) * 100, 1),
                    })
                report["distributions"].append({
                    "columnName": str(col),
                    "bins": bins,
                    "histogram": hist.tolist(),
                })
        except Exception:
            pass

    # 时序分析
    time_cols = [c for c in df.columns if 'datetime' in str(df[c].dtype) or 'date' in str(c).lower() or 'time' in str(c).lower()]
    report["timeSeries"] = []
    for col in time_cols[:5]:
        try:
            ts_data = df[col].dropna()
            if len(ts_data) > 2:
                report["timeSeries"].append({
                    "columnName": str(col),
                    "min": str(ts_data.min()),
                    "max": str(ts_data.max()),
                    "range_days": (ts_data.max() - ts_data.min()).days if hasattr(ts_data.max(), 'days') else None,
                    "frequency": str(ts_data.dt.freq) if hasattr(ts_data, 'dt') and hasattr(ts_data.dt, 'freq') else None,
                })
        except Exception:
            pass

    # 震荡检测 (对数值列)
    report["oscillations"] = []
    for col in numeric_cols[:10]:
        try:
            col_data = df[col].dropna()
            if len(col_data) > 5:
                vals = col_data.values
                diff = np.diff(vals)
                sign_changes = np.sum(np.diff(np.sign(diff)) != 0)
                oscillation_ratio = sign_changes / (len(diff) - 1) if len(diff) > 1 else 0
                if oscillation_ratio > 0.5:
                    report["oscillations"].append({
                        "columnName": str(col),
                        "oscillationRatio": round(oscillation_ratio, 3),
                        "volatility": round(float(col_data.std() / col_data.mean()) if col_data.mean() != 0 else 0, 4),
                        "isHighOscillation": oscillation_ratio > 0.7,
                    })
        except Exception:
            pass

    # 质量评分
    score = 100.0
    missing_ratio = df.isnull().mean().mean()
    duplicate_ratio = df.duplicated().mean()
    score -= missing_ratio * 30
    score -= duplicate_ratio * 20
    for col_info in report["columns"]:
        if col_info.get("hasOutliers"):
            score -= 5
        if col_info.get("nullPercent", "0%") != "0.0%":
            null_pct = float(col_info["nullPercent"].replace("%", ""))
            if null_pct > 50:
                score -= 10
            elif null_pct > 20:
                score -= 5
    report["qualityScore"] = max(0, round(score, 1))

    return report

if __name__ == "__main__":
    import sys
    file_path = sys.argv[1]
    sheet_name = sys.argv[2] if len(sys.argv) > 2 else None
    result = describe(file_path, sheet_name)

    # 处理 numpy 类型的 JSON 序列化
    def default_handler(obj):
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

    print(json.dumps(result, ensure_ascii=False, indent=2, default=default_handler))
