/**
 * Ahmetli Medya - Pagination Module
 * Firestore-based pagination
 */

import { getDb } from './utils.js';

export class Pagination {
  constructor(options = {}) {
    this.collectionName = options.collectionName || 'news';
    this.pageSize = options.pageSize || 20;
    this.orderBy = options.orderBy || 'createdAt';
    this.orderDirection = options.orderDirection || 'desc';
    this.currentPage = 0;
    this.totalPages = 0;
    this.totalItems = 0;
    this.currentQuery = null;
    this.pages = []; // Store document snapshots for each page
    this.onPageChange = options.onPageChange || null;
    this.filters = {};
  }

  setFilters(filters) {
    this.filters = filters || {};
    this.reset();
  }

  setOrder(orderBy, direction = 'desc') {
    this.orderBy = orderBy;
    this.orderDirection = direction;
    this.reset();
  }

  reset() {
    this.currentPage = 0;
    this.pages = [];
    this.currentQuery = null;
  }

  buildQuery() {
    const db = getDb();
    if (!db) return null;

    let query = db.collection(this.collectionName);

    // Apply filters
    Object.keys(this.filters).forEach(key => {
      const value = this.filters[key];
      if (value !== null && value !== undefined && value !== '') {
        query = query.where(key, '==', value);
      }
    });

    // Order by
    query = query.orderBy(this.orderBy, this.orderDirection);

    return query;
  }

  async getPage(pageNumber) {
    const db = getDb();
    if (!db) return { items: [], hasNext: false, hasPrev: false };

    try {
      let query = this.buildQuery();
      if (!query) return { items: [], hasNext: false, hasPrev: false };

      // If going to a specific page we've already visited
      if (pageNumber < this.pages.length) {
        const pageSnapshot = this.pages[pageNumber];
        query = query.startAt(pageSnapshot);
      }
      // If going forward
      else if (pageNumber > 0 && this.pages.length > 0) {
        const lastPage = this.pages[this.pages.length - 1];
        query = query.startAfter(lastPage);
      }

      query = query.limit(this.pageSize + 1); // Get one extra to check if there's a next page

      const snapshot = await query.get();
      const items = [];
      let lastDoc = null;

      snapshot.forEach((doc, index) => {
        if (index < this.pageSize) {
          items.push({ id: doc.id, ...doc.data() });
          lastDoc = doc;
        }
      });

      // Store the first document of this page for future navigation
      if (items.length > 0 && pageNumber >= this.pages.length) {
        this.pages[pageNumber] = snapshot.docs[0];
      }

      this.currentPage = pageNumber;

      const hasNext = snapshot.docs.length > this.pageSize;
      const hasPrev = pageNumber > 0;

      if (this.onPageChange) {
        this.onPageChange({
          items,
          page: pageNumber,
          hasNext,
          hasPrev,
          totalItems: this.totalItems
        });
      }

      return { items, hasNext, hasPrev };
    } catch (error) {
      console.error('Pagination error:', error);
      throw error;
    }
  }

  async next() {
    return await this.getPage(this.currentPage + 1);
  }

  async prev() {
    if (this.currentPage > 0) {
      return await this.getPage(this.currentPage - 1);
    }
    return await this.getPage(0);
  }

  async first() {
    this.reset();
    return await this.getPage(0);
  }

  async getTotalCount() {
    const db = getDb();
    if (!db) return 0;

    try {
      let query = this.buildQuery();
      if (!query) return 0;

      const snapshot = await query.get();
      this.totalItems = snapshot.size;
      this.totalPages = Math.ceil(this.totalItems / this.pageSize);
      return this.totalItems;
    } catch (error) {
      console.error('Get total count error:', error);
      return 0;
    }
  }

  getCurrentPage() {
    return this.currentPage;
  }

  getTotalPages() {
    return this.totalPages;
  }

  getPageInfo() {
    return {
      current: this.currentPage + 1, // 1-indexed for display
      total: this.totalPages,
      totalItems: this.totalItems
    };
  }
}

export default Pagination;
