/**
 * Ahmetli Medya - SEO Module
 * SEO scoring and recommendations
 */

export class SEOAnalyzer {
  constructor() {
    this.titleMin = 30;
    this.titleMax = 70;
    this.descMin = 120;
    this.descMax = 160;
    this.contentMin = 300;
    this.minKeywords = 3;
  }

  analyze(data) {
    const {
      title = '',
      metaDescription = '',
      content = '',
      keywords = [],
      hasImage = false
    } = data;

    let score = 0;
    const recommendations = [];
    const warnings = [];

    // Title length (25 points)
    const titleLen = title.trim().length;
    if (titleLen >= this.titleMin && titleLen <= this.titleMax) {
      score += 25;
    } else if (titleLen === 0) {
      recommendations.push('Başlık ekleyin');
    } else if (titleLen < this.titleMin) {
      warnings.push(`Başlık çok kısa (${titleLen} karakter, en az ${this.titleMin} olmalı)`);
      score += Math.round((titleLen / this.titleMin) * 25);
    } else {
      warnings.push(`Başlık çok uzun (${titleLen} karakter, en fazla ${this.titleMax} olmalı)`);
      score += 20;
    }

    // Meta description (25 points)
    const descLen = metaDescription.trim().length;
    if (descLen >= this.descMin && descLen <= this.descMax) {
      score += 25;
    } else if (descLen === 0) {
      recommendations.push('Meta açıklama ekleyin');
    } else if (descLen < this.descMin) {
      warnings.push(`Meta açıklama çok kısa (${descLen} karakter, en az ${this.descMin} olmalı)`);
      score += Math.round((descLen / this.descMin) * 25);
    } else {
      warnings.push(`Meta açıklama çok uzun (${descLen} karakter, en fazla ${this.descMax} olmalı)`);
      score += 20;
    }

    // Image present (25 points)
    if (hasImage) {
      score += 25;
    } else {
      recommendations.push('Kapak görseli ekleyin');
    }

    // Content length (15 points)
    const contentText = this.stripHtml(content);
    const contentLen = contentText.length;
    if (contentLen >= this.contentMin) {
      score += 15;
    } else if (contentLen === 0) {
      recommendations.push('İçerik ekleyin');
    } else {
      warnings.push(`İçerik çok kısa (${contentLen} karakter, en az ${this.contentMin} olmalı)`);
      score += Math.round((contentLen / this.contentMin) * 15);
    }

    // Keywords (10 points)
    if (keywords.length >= this.minKeywords) {
      score += 10;
    } else if (keywords.length === 0) {
      recommendations.push('En az 3 anahtar kelime ekleyin');
    } else {
      warnings.push(`${this.minKeywords - keywords.length} anahtar kelime daha ekleyin`);
      score += Math.round((keywords.length / this.minKeywords) * 10);
    }

    // Cap score at 100
    score = Math.min(100, Math.max(0, score));

    return {
      score,
      scoreClass: this.getScoreClass(score),
      scoreLabel: this.getScoreLabel(score),
      recommendations,
      warnings,
      details: {
        title: { length: titleLen, min: this.titleMin, max: this.titleMax },
        description: { length: descLen, min: this.descMin, max: this.descMax },
        content: { length: contentLen, min: this.contentMin },
        keywords: { count: keywords.length, min: this.minKeywords },
        hasImage
      }
    };
  }

  getScoreClass(score) {
    if (score >= 75) return 'good';
    if (score >= 50) return 'warning';
    return 'poor';
  }

  getScoreLabel(score) {
    if (score >= 75) return 'İyi';
    if (score >= 50) return 'Orta';
    return 'Zayıf';
  }

  stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Get word count
  getWordCount(text) {
    const stripped = this.stripHtml(text);
    return stripped.split(/\s+/).filter(Boolean).length;
  }

  // Extract keywords from text
  extractKeywords(text, count = 5) {
    const stripped = this.stripHtml(text).toLowerCase();
    const words = stripped.split(/\s+/).filter(w => w.length > 3);

    // Count frequency
    const freq = {};
    words.forEach(word => {
      freq[word] = (freq[word] || 0) + 1;
    });

    // Sort by frequency and return top N
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(entry => entry[0]);
  }
}

export default SEOAnalyzer;
