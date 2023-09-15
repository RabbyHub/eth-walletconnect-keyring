"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cached = void 0;
class Cached {
    constructor() {
        this.topics = new Map();
        const topics = localStorage.getItem('wc_topics');
        if (topics) {
            this.topics = new Map(JSON.parse(topics));
        }
    }
    getTopic(topic) {
        return this.topics.get(topic);
    }
    setTopic(topic, data) {
        this.topics.set(topic, data);
        localStorage.setItem('wc_topics', JSON.stringify(Array.from(this.topics)));
    }
    deleteTopic(topic) {
        this.topics.delete(topic);
        localStorage.setItem('wc_topics', JSON.stringify(Array.from(this.topics)));
    }
    updateTopic(topic, data) {
        if (this.topics.has(topic)) {
            this.setTopic(topic, Object.assign(Object.assign({}, this.getTopic(topic)), data));
        }
    }
    findTopic(data) {
        const { address, brandName, chainId } = data;
        const keys = this.topics.keys();
        for (const key of keys) {
            const value = this.getTopic(key);
            if ((value === null || value === void 0 ? void 0 : value.address.toLowerCase()) === (address === null || address === void 0 ? void 0 : address.toLowerCase()) &&
                (value === null || value === void 0 ? void 0 : value.brandName.toLowerCase()) === (brandName === null || brandName === void 0 ? void 0 : brandName.toLowerCase())) {
                return key;
            }
        }
    }
    getAllTopics() {
        return [...this.topics.keys()];
    }
}
exports.Cached = Cached;
